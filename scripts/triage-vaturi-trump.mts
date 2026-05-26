#!/usr/bin/env tsx
/**
 * One-off triage: hide the Vaturi/Herzog/Trump claim whose verifier
 * explanation contains the factually-wrong premise "Trump is not the
 * US president" (Trump took office 20.1.2025).
 *
 * Searches by quote substring so it's robust to small punctuation
 * differences. Idempotent — skips if correctionNote is already set.
 *
 * Dry-run by default. Pass --apply to commit changes.
 */
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");

// Substring must appear in the quote — distinctive enough to match
// only the target claim. Hebrew quote marks vary (״ vs " vs ').
const QUOTE_NEEDLE = "הרצוג פחד לטוס מעל ארצות הברית";

const CORRECTION_NOTE =
  'הוסר: הסבר שגוי במישור עובדתי. ההסבר טען שדונלד טראמפ "אינו נשיא ארה״ב", אך טראמפ מכהן כנשיא ה-47 של ארה״ב מ-20.1.2025. הטענה תיבחן מחדש.';

const matches = await prisma.claim.findMany({
  where: {
    politicianId: "nissim-vaturi",
    quote: { contains: QUOTE_NEEDLE },
  },
  select: {
    id: true,
    quote: true,
    verdict: true,
    explanation: true,
    editorApproved: true,
    correctionNote: true,
    createdAt: true,
  },
});

console.log(`Found ${matches.length} matching claim(s):\n`);

for (const c of matches) {
  console.log(`  id: ${c.id}`);
  console.log(`  verdict: ${c.verdict}`);
  console.log(`  editorApproved: ${c.editorApproved}`);
  console.log(`  correctionNote: ${c.correctionNote ?? "(none)"}`);
  console.log(`  quote: ${c.quote}`);
  console.log(`  explanation: ${c.explanation.slice(0, 240)}...`);
  console.log(`  createdAt: ${c.createdAt.toISOString()}`);
  console.log();
}

if (matches.length === 0) {
  console.log("No matches. Nothing to triage.");
  await prisma.$disconnect();
  process.exit(0);
}

if (matches.length > 1) {
  console.warn(`! Multiple matches (${matches.length}). Refine QUOTE_NEEDLE before --apply.`);
  if (APPLY) {
    console.error("Refusing to apply when match count > 1.");
    await prisma.$disconnect();
    process.exit(1);
  }
}

if (!APPLY) {
  console.log("Dry-run. Re-run with --apply to commit:");
  console.log("  - set editorApproved=false");
  console.log("  - set correctionNote (Hebrew)");
  console.log("  - set correctedAt=now");
  await prisma.$disconnect();
  process.exit(0);
}

let updated = 0;
let skipped = 0;
for (const c of matches) {
  if (c.correctionNote && c.correctionNote.includes("טראמפ")) {
    console.log(`  ✓ already triaged: ${c.id} — skipping (idempotent).`);
    skipped++;
    continue;
  }
  await prisma.claim.update({
    where: { id: c.id },
    data: {
      editorApproved: false,
      correctionNote: CORRECTION_NOTE,
      correctedAt: new Date(),
    },
  });
  console.log(`  ✗ hidden: ${c.id}`);
  updated++;
}

console.log(`\nDone. updated=${updated} skipped=${skipped}`);
await prisma.$disconnect();
