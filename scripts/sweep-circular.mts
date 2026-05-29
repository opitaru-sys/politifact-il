#!/usr/bin/env tsx
/**
 * Sweep published "true" claims whose verdict only confirms the SPEECH ACT
 * ("[politician] indeed declared that X") rather than the substance — the
 * "it's TRUE that he said it" failure mode. Deterministic and FREE (no Gemini):
 * uses the exact same isCircularVerification() the live pipeline now uses, so
 * there's no drift between the sweep and the gate.
 *
 *   (default)   COUNT MODE — read-only. Reports how many + samples.
 *   --apply     Withhold them (status="review", editorApproved=false) so they
 *               leave the public site for human triage in /admin/review.
 *   --limit N   Only process the first N (validation run).
 *
 * Env: DATABASE_URL.
 */
import { readFileSync } from "fs";

function forceLoadEnv(key: string): void {
  if (process.env[key] && process.env[key]!.length > 5) return;
  try {
    const content = readFileSync(".env.local", "utf8");
    const m = content.match(new RegExp(`^${key}=(.*)$`, "m"));
    if (m) {
      let val = m[1].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (val.length > 5) process.env[key] = val;
    }
  } catch {
    /* missing */
  }
}
forceLoadEnv("DATABASE_URL");

const { PrismaClient } = await import("@prisma/client");
const { isCircularVerification } = await import("../src/lib/fact-check");
const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const limitIdx = process.argv.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) : undefined;

const NOTE =
  "הפסק מאמת רק שהפוליטיקאי אמר זאת, לא את נכונות התוכן (אימות מעגלי). דרושה הכרעה אנושית.";

const claims = await prisma.claim.findMany({
  where: { status: "published", editorApproved: true, verdict: "true" },
  select: {
    id: true,
    verdict: true,
    confidence: true,
    summary: true,
    explanation: true,
    politician: { select: { name: true } },
  },
});

const hits = claims.filter((c) =>
  isCircularVerification({
    verdict: c.verdict,
    confidence: c.confidence ?? 0,
    explanation: c.explanation ?? "",
    summary: c.summary ?? "",
  }),
);

if (!APPLY) {
  console.log(`Published "true" claims: ${claims.length}`);
  console.log(`Circular (verdict justified by the saying, not the content): ${hits.length}`);
  for (const c of hits.slice(0, 20)) {
    console.log(`  - ${c.politician.name}: ${(c.summary || c.explanation || "").slice(0, 95)}`);
  }
  console.log(`\nDry run. Re-run with --apply to withhold them to review (free, reversible).`);
  await prisma.$disconnect();
  process.exit(0);
}

const targets = LIMIT !== undefined ? hits.slice(0, LIMIT) : hits;
let done = 0;
for (const c of targets) {
  await prisma.claim.update({
    where: { id: c.id },
    data: {
      status: "review",
      editorApproved: false,
      verifiedAt: new Date(),
      verifierNotes: NOTE,
    },
  });
  done++;
  console.log(`  withheld ${c.politician.name}: ${(c.summary || "").slice(0, 70)}`);
}
console.log(`\nDone. Withheld ${done} circular "true" claims to review.`);
await prisma.$disconnect();
process.exit(0);
