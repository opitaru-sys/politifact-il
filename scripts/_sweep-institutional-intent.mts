#!/usr/bin/env tsx
/** Sweep live (editorApproved=true, status=published) claims with verdict=true
 *  whose quote matches the conservative institutional-intent regex. Downgrade
 *  matches to half-true with the standard caveat + correctionNote.
 *
 *  Intentionally narrow — false negatives over false positives. Run dry first;
 *  hand-spot-check the list before --apply. */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;
const { PrismaClient } = await import("@prisma/client");
const { applyDowngrade, INSTITUTIONAL_INTENT_RE } = await import(
  "../src/lib/institutional-intent"
);
const p = new PrismaClient();

const APPLY = process.argv.includes("--apply");

const rows = await p.claim.findMany({
  where: { editorApproved: true, status: "published", verdict: "true" },
  select: {
    id: true,
    quote: true,
    explanation: true,
    verifierNotes: true,
    politicianId: true,
    politician: { select: { name: true } },
    correctionNote: true,
  },
});

console.log(`Scanning ${rows.length} live verdict=true claims...`);

const matches = rows.filter((r) => INSTITUTIONAL_INTENT_RE.test(r.quote));
console.log(`${matches.length} match the institutional-intent pattern.\n`);

for (const c of matches) {
  console.log(`--- ${c.politician.name} (${c.id}) ---`);
  console.log(`  quote: ${c.quote.slice(0, 140)}`);
  if (c.correctionNote) {
    console.log(`  SKIP: already has correctionNote — leaving alone`);
    continue;
  }

  const notes = c.verifierNotes ? c.verifierNotes.split("; ") : [];
  const next = applyDowngrade({
    verdict: "true",
    explanation: c.explanation,
    notes,
  });

  if (APPLY) {
    await p.claim.update({
      where: { id: c.id },
      data: {
        verdict: next.verdict,
        explanation: next.explanation,
        verifierNotes: next.notes.join("; "),
        correctionNote:
          "פסק הדין שונה מ'אמת' ל'חצי-אמת' לאחר עדכון כללי האימות: הצהרת כוונה מוסדית נגד יעד מזוהה אומתה כי נאמרה, אך ביצוע בפועל וסמכות חוקית לא נבדקו. עיינו ב'הצהרת כוונה מוסדית' בתחילת ההסבר.",
        correctedAt: new Date(),
      },
    });
    console.log(`  ✓ downgraded`);
  } else {
    console.log(`  would downgrade to half-true + add caveat`);
  }
}

console.log(`\n${matches.length} candidate(s), ${matches.filter((c) => !c.correctionNote).length} actionable.`);
if (!APPLY) console.log("Dry run. --apply to commit.");
await p.$disconnect();
