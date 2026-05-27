#!/usr/bin/env tsx
/** Hide the two claims flagged in user feedback 2026-05-27:
 *  - Netanyahu "מוחמד עודה - מנהיג הזרוע הצבאית של חמאס" (false verdict
 *    based on post-facto info — Oudeh was eliminated same day)
 *  - Israel Katz "דן חלוץ הכשיר סרבנות" (true verdict only verified the
 *    quote was said, not the characterization itself)
 */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;
const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();

const APPLY = process.argv.includes("--apply");

const targets = [
  {
    politicianId: "netanyahu",
    needle: "מוחמד עודה",
    note: 'הוסר: פסק הדין השתמש בידיעות שהיו ידועות רק לאחר אמירת הטענה (חיסולו של עודה באותו יום). הטענה הייתה נכונה בעת אמירתה — נתניהו זיהה נכון את עודה כמנהיג הזרוע הצבאית.',
  },
  {
    politicianId: "israel-katz",
    needle: "דן חלוץ הכשיר סרבנות",
    note: 'הוסר: הבדיקה אישרה שכ"ץ אכן אמר את הציטוט, אך לא בחנה האם תוכן הטענה (ש"חלוץ הכשיר סרבנות") נכון עובדתית. זוהי טענה אינטרפרטטיבית/אפיונית, לא עובדתית.',
  },
];

for (const t of targets) {
  const matches = await p.claim.findMany({
    where: { politicianId: t.politicianId, quote: { contains: t.needle } },
    select: { id: true, quote: true, verdict: true, editorApproved: true, correctionNote: true },
  });
  console.log(`\n[${t.politicianId}] needle="${t.needle}" → ${matches.length} match(es)`);
  for (const c of matches) {
    console.log(`  [${c.editorApproved ? "✓" : "✗"}] ${c.verdict.padEnd(10)} id=${c.id}`);
    console.log(`    quote: ${c.quote.slice(0, 100)}`);
    if (c.correctionNote) {
      console.log(`    already has correctionNote: ${c.correctionNote.slice(0, 80)}`);
    }
    if (APPLY && c.editorApproved && !c.correctionNote) {
      await p.claim.update({
        where: { id: c.id },
        data: { editorApproved: false, correctionNote: t.note, correctedAt: new Date() },
      });
      console.log(`    ✗ hidden`);
    }
  }
}

if (!APPLY) console.log("\nDry-run. --apply to commit.");
await p.$disconnect();
