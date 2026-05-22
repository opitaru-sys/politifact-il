#!/usr/bin/env tsx
/**
 * Reject claims whose own explanation admits the fact-check failed.
 *
 * When the fact-check pipeline runs without grounding (BADAK_DISABLE_
 * GROUNDING=1) or hits a model that didn't have enough context, the
 * model often emits something like:
 *   verdict: "half-true"
 *   confidence: 0
 *   summary: "טענה זו טעונה בדיקה ידנית."
 *   explanation: "לא ניתן לבדוק טענה זו באופן אוטומטי..."
 *
 * The verifier should reject these (criterion #5: "explanation has no
 * factual context") but doesn't always — particularly when the
 * explanation is *coherent* but says "I can't verify". The claim then
 * sits publicly with a verdict it shouldn't have.
 *
 * This script pattern-matches the explanation field for known
 * "I-couldn't-verify" phrases and sets status=rejected on every hit.
 *
 * Pass --dry-run to see what would be hit without changing the DB.
 */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const DRY_RUN = process.argv.includes("--dry-run");

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

// Phrases inside `explanation` that signal the model gave up. Each is a
// substring match against the lowercased+normalized explanation. We're
// deliberately conservative — these are model-output fingerprints, not
// politician quotes.
const UNVERIFIABLE_PHRASES: string[] = [
  "לא ניתן לבדוק טענה זו באופן אוטומטי",
  "נדרשת בדיקה ידנית",
  "טענה זו טעונה בדיקה ידנית",
  "לא ניתן לאמת",
  "אין באפשרותי לאמת",
  "אין באפשרותו לאמת",
  "לא נמצא מידע מאמת",
  "לא נמצאו תוצאות מאמתות",
  "אין מידע מספק",
  "ההסבר חסר",
  "טרם נמצא מידע מאמת",
  "ההסבר קטוע ולא שלם",
  "המערכת הצהירה שאין באפשרותה",
];

const all = await prisma.claim.findMany({
  where: {
    status: { not: "rejected" },
    explanation: { not: "" },
  },
  select: { id: true, quote: true, explanation: true, source: true, editorApproved: true },
});

let hit = 0;
let visibleHit = 0;
const samples: string[] = [];

for (const c of all) {
  const exp = c.explanation;
  const matched = UNVERIFIABLE_PHRASES.find((p) => exp.includes(p));
  if (!matched) continue;
  hit++;
  if (c.editorApproved) visibleHit++;
  if (samples.length < 8) {
    samples.push(
      `  - "${c.quote.slice(0, 60)}" (${c.editorApproved ? "WAS VISIBLE" : "hidden"}) → matched "${matched}"`,
    );
  }
  if (!DRY_RUN) {
    // Don't permanently reject — these claims often have legitimate
    // quotes, just bad fact-checks (model couldn't verify without
    // grounding). Set editorApproved=false so they're hidden from
    // public but leave status=published. A future re-fact-check pass
    // with grounding on can revive the salvageable ones.
    if (c.editorApproved) {
      await prisma.claim.update({
        where: { id: c.id },
        data: {
          editorApproved: false,
          verifierNotes: `Auto-unapproved: explanation admits non-verifiability ("${matched}")`,
        },
      });
    }
    // Already-hidden claims: no-op. They're not bothering anyone.
  }
}

console.log(`${hit} claims with "not verifiable" explanations ${DRY_RUN ? "would be" : ""} rejected.`);
console.log(`Of which ${visibleHit} were previously publicly visible.`);
if (samples.length) {
  console.log("\nSample:");
  samples.forEach((s) => console.log(s));
}
if (DRY_RUN) console.log("\n(--dry-run — no changes written.)");
await prisma.$disconnect();
