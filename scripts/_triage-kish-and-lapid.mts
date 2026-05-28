#!/usr/bin/env tsx
/** Hide 5 Kish historical/encyclopedic claims (Pharhud / WW2 / "axis of evil"
 *  rhetoric) and 2 Lapid trivial-procedural claims ("X was PM/minister on
 *  Oct 7"). Flagged by Facebook commenter "Head of Product" on 2026-05-27.
 *  Same failure mode as the Limor Son Har Melech triage from this morning
 *  and the Katz/Halutz triage from yesterday: verifier confirmed words were
 *  said but the content isn't a political claim worth a fact-check verdict. */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;
const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();

const APPLY = process.argv.includes("--apply");

const targets: { id: string; category: string; note: string }[] = [
  // Kish — historical / encyclopedic / about-other-MK
  {
    id: "cmpnygfp9001t3h86yhis06ou",
    category: "historical",
    note: 'הוסר: תיאור היסטורי של תעמולת ציר הרשע במלחמת העולם השנייה, לא טענה פוליטית מהותית של השר על תפקידו.',
  },
  {
    id: "cmpnygegd001n3h86js8ykhcw",
    category: "about-other-mk",
    note: 'הוסר: הצהרה על חקיקה של חבר כנסת אחר (אופיר כץ), לא טענה פוליטית של קיש על תפקידו.',
  },
  {
    id: "cmpnygigz002b3h86w0h99mh6",
    category: "historical-research",
    note: 'הוסר: מסקנה היסטורית-אקדמית על שיתוף פעולה נאצי-עיראקי במלחמת העולם השנייה, לא טענה פוליטית של השר.',
  },
  {
    id: "cmpnygktf002j3h86ke05dhd6",
    category: "anniversary",
    note: 'הוסר: אמירה טקסית על ציון 85 שנה לפרעות הפרהוד, לא טענה פוליטית הניתנת לאימות.',
  },
  {
    id: "cmpnygl90002l3h86dv9qn0or",
    category: "rhetoric",
    note: 'הוסר: רטוריקה כללית על "ציר הרשע האיראני" ללא נתון ספציפי או פעולה הניתנת לאימות עצמאית.',
  },
  // Lapid — trivial procedural facts (verifying "X was PM/minister" not actually a political claim)
  {
    id: "cmpo9i94z000b43kebgn2mm79",
    category: "trivial-procedural",
    note: 'הוסר: אמירת עובדה היסטורית טריוויאלית (מי כיהן כראש ממשלה בתאריך מסוים) שאינה טענה פוליטית הניתנת למחלוקת. הפסק "אמת" אישר רק את הפרט הפרוצדורלי, לא את הטענה המהותית שעומדת מאחורי האמירה.',
  },
  {
    id: "cmpo9iaef000d43kel3if9k7e",
    category: "trivial-procedural",
    note: 'הוסר: אמירת עובדה היסטורית טריוויאלית (מי כיהן כשר בתאריך מסוים) שאינה טענה פוליטית הניתנת למחלוקת. הפסק "אמת" אישר רק את הפרט הפרוצדורלי.',
  },
];

console.log(`Triaging ${targets.length} claims (dry-run)\n`);
let hidden = 0;
let skipped = 0;

for (const t of targets) {
  const c = await p.claim.findUnique({
    where: { id: t.id },
    select: {
      id: true,
      politicianId: true,
      quote: true,
      verdict: true,
      editorApproved: true,
      correctionNote: true,
    },
  });
  if (!c) {
    console.log(`  ? ${t.id} NOT FOUND`);
    continue;
  }
  if (c.correctionNote) {
    console.log(`  - ${c.politicianId} | already has correctionNote, skipping`);
    skipped++;
    continue;
  }
  console.log(`  ✗ [${t.category}] ${c.politicianId} | ${c.quote.slice(0, 90)}`);
  if (APPLY && c.editorApproved) {
    await p.claim.update({
      where: { id: c.id },
      data: {
        editorApproved: false,
        correctionNote: t.note,
        correctedAt: new Date(),
      },
    });
    hidden++;
  }
}

console.log(`\n${APPLY ? hidden : 0} hidden, ${skipped} already corrected.`);
if (!APPLY) console.log("Dry run. --apply to commit.");
await p.$disconnect();
