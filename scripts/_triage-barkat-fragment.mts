#!/usr/bin/env tsx
/**
 * Hide the Nir Barkat "הקרן שהקמתי" claim — 2-word noun-phrase
 * fragment that passed the editor agent (the fund DID exist), but
 * isn't a meaningful standalone fact-check item.
 *
 * Dry-run by default. --apply to commit.
 */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const NEEDLE = "הקרן שהקמתי";
const NOTE = 'הוסר: הציטוט המקורי הוא צירוף שמני קצר ("הקרן שהקמתי") ולא טענה עצמאית הניתנת לבדיקה. הפסק התייחס לעובדה שהוזכרה במשפט הסובב, לא לציטוט עצמו.';

const matches = await prisma.claim.findMany({
  where: { politicianId: "nir-barkat", quote: { contains: NEEDLE } },
  select: { id: true, quote: true, verdict: true, editorApproved: true, correctionNote: true, source: true, date: true },
});
console.log(`Found ${matches.length} match(es):`);
for (const c of matches) {
  console.log(`  [${c.editorApproved ? "✓" : "✗"}] id=${c.id} verdict=${c.verdict}`);
  console.log(`    quote: "${c.quote}"`);
  console.log(`    src:   ${c.source}, ${c.date.toISOString().slice(0,10)}`);
  console.log(`    correctionNote: ${c.correctionNote ?? "(none)"}`);
}

if (!APPLY) {
  console.log("\nDry-run. Re-run with --apply.");
  await prisma.$disconnect();
  process.exit(0);
}

let updated = 0;
for (const c of matches) {
  if (c.correctionNote && c.correctionNote.includes("צירוף שמני")) {
    console.log(`  ✓ already triaged: ${c.id}`);
    continue;
  }
  await prisma.claim.update({
    where: { id: c.id },
    data: { editorApproved: false, correctionNote: NOTE, correctedAt: new Date() },
  });
  console.log(`  ✗ hidden: ${c.id}`);
  updated++;
}
console.log(`\nDone. updated=${updated}`);
await prisma.$disconnect();
