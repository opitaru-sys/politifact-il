/** Hide Netanyahu's "I expressed to Trump my appreciation for Epic Fury" claim.
 *  Diplomatic mutual-praise of a self-reported private conversation. Verifier
 *  approved as TRUE because the underlying operations are verifiable, but the
 *  CLAIM itself is "I thanked Trump" — a ceremonial diplomatic statement
 *  with zero public-accountability value. Editor #12 territory. */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const NOTE =
  'הוסר בעקבות מבחן עניין ציבורי (קריטריון עורך #12): שבחים דיפלומטיים הדדיים על שיחה פרטית מדווחת. ' +
  'הטענה אומתה כ"אמת" משום שהמבצעים הצבאיים שהוזכרו אכן התקיימו, אך הטענה עצמה ("הבעתי לטראמפ הערכה") ' +
  'אינה ניתנת לאימות ואינה כוללת מידע ציבורי בעל ערך בדיקה. ' +
  'כשמודל הקטגוריות הארכיטקטוני (public / profile_only) יוטמע, טענה זו תופיע כ-profile_only בלבד.';

const needles = [
  "הבעתי בפני הנשיא טראמפ את הערכתי העמוקה",
  "Epic Fury",
  "שאגת הארי",
];

console.log(`Triaging Netanyahu Trump-praise claim (${APPLY ? "APPLY" : "dry-run"})\n`);

for (const needle of needles) {
  const matches = await p.claim.findMany({
    where: {
      politicianId: "netanyahu",
      quote: { contains: needle },
    },
    select: {
      id: true,
      quote: true,
      verdict: true,
      editorApproved: true,
      correctionNote: true,
      createdAt: true,
    },
  });

  if (matches.length === 0) continue;
  console.log(`\nNeedle "${needle.slice(0, 40)}…": ${matches.length} match(es)`);
  for (const c of matches) {
    console.log(`  [${c.verdict.padEnd(10)}] ${c.id} approved=${c.editorApproved} created=${c.createdAt.toISOString().slice(0, 10)}`);
    console.log(`    ${c.quote.slice(0, 140)}`);
    if (c.correctionNote) {
      console.log(`    SKIP: already has correctionNote`);
      continue;
    }
    if (APPLY && c.editorApproved) {
      await p.claim.update({
        where: { id: c.id },
        data: {
          editorApproved: false,
          correctionNote: NOTE,
          correctedAt: new Date(),
        },
      });
      console.log(`    ✗ hidden`);
    }
  }
}

if (!APPLY) console.log("\nDry run. --apply to commit.");
await p.$disconnect();
