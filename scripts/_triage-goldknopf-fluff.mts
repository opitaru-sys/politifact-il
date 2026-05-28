#!/usr/bin/env tsx
/** Triage two Goldknopf claims flagged in user/Codex back-and-forth on
 *  2026-05-27 as the textbook examples of editor criterion #12 (public
 *  interest gate). The third Goldknopf claim on the same speech ("Rebbe
 *  of Gur ordered us to demand deputy PM") stays live because it falls
 *  under the explicit exception: external religious authority over public
 *  appointments. */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;
const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();

const APPLY = process.argv.includes("--apply");

const needles = [
  {
    needle: "ביקשתי להיות סגן רה",
    note: 'הוסר בעקבות מבחן עניין ציבורי (קריטריון עורך #12): שאיפת תפקיד אישית של פוליטיקאי, ללא תוכן מדיניות / כספי ציבור / חוקיות / השפעה על מינויים. אזרח סביר אינו מרוויח מידע מהותי מאישור או הפרכה של "האם פוליטיקאי X ביקש תפקיד Y". כשמודל הקטגוריות הארכיטקטוני (public / profile_only) יוטמע, טענה זו תופיע כ-profile_only בלבד.',
  },
  {
    needle: "בסוף ביבי אמר שהוא ייתן לי שר כפול",
    note: 'הוסר בעקבות מבחן עניין ציבורי (קריטריון עורך #12): דיווח על שיחה פרטית במסגרת מו"מ קואליציוני שאי-אפשר לאמת באופן עצמאי. אזרח סביר אינו מרוויח מידע מהותי על מדיניות / חוקיות / כספי ציבור מאישור או הפרכה של "האם ביבי אמר X לפוליטיקאי Y". כשמודל הקטגוריות הארכיטקטוני (public / profile_only) יוטמע, טענה זו תופיע כ-profile_only בלבד.',
  },
];

console.log(`Triaging ${needles.length} Goldknopf fluff claims (${APPLY ? "APPLY" : "dry-run"})\n`);

for (const t of needles) {
  const matches = await p.claim.findMany({
    where: {
      politicianId: "goldknopf",
      quote: { contains: t.needle },
    },
    select: {
      id: true,
      quote: true,
      verdict: true,
      editorApproved: true,
      correctionNote: true,
    },
  });

  console.log(`\nNeedle "${t.needle}": ${matches.length} match(es)`);
  for (const c of matches) {
    console.log(`  [${c.verdict.padEnd(10)}] ${c.id} approved=${c.editorApproved}`);
    console.log(`    ${c.quote.slice(0, 120)}`);
    if (c.correctionNote) {
      console.log(`    SKIP: already has correctionNote`);
      continue;
    }
    if (APPLY && c.editorApproved) {
      await p.claim.update({
        where: { id: c.id },
        data: {
          editorApproved: false,
          correctionNote: t.note,
          correctedAt: new Date(),
        },
      });
      console.log(`    ✗ hidden`);
    }
  }
}

if (!APPLY) console.log("\nDry run. --apply to commit.");
await p.$disconnect();
