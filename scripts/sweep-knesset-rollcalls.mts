#!/usr/bin/env tsx
/**
 * Find and hide Knesset roll-call / attendance claims that the
 * extractor accidentally promoted to fact-checkable claims.
 *
 * Example targets:
 *   "חבר הכנסת X - אינו נוכח"
 *   "עדי עזוז - אינה נוכחת"
 *   "נוכחים: ..."
 *   "X מצביע בעד"  (sometimes — these are sometimes legit; only kill
 *                  if the quote is JUST the vote line, not a speech)
 *
 * Action: set status="rejected" + editorApproved=false so they don't
 * appear publicly and can't be revived by a re-fact-check. Adds a
 * verifierNotes line so the admin UI shows why.
 */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

// Regex patterns that identify Knesset procedural / attendance content.
// Order: most specific first.
const ROLLCALL_PATTERNS: { regex: RegExp; reason: string }[] = [
  { regex: /אינ[וה] נוכח[ת]?/, reason: "Knesset roll-call: attendance marker" },
  { regex: /לא נוכח[ת]?\s*$/, reason: "Knesset roll-call: not present" },
  { regex: /^נוכחים?:/, reason: "Knesset roll-call: presence list" },
  { regex: /^נעדרים?:/, reason: "Knesset roll-call: absentee list" },
  { regex: /הצבעה (מס׳|מספר) \d+/, reason: "Knesset vote-number header" },
  { regex: /^ההצבעה .{0,30}(התקבלה|נדחתה)\s*$/, reason: "Knesset vote outcome line" },
  // Generic procedural lines that the extractor sometimes promotes
  { regex: /^(הישיבה|הדיון|הוועדה) .{0,40}(נפתחה|ננעלה|הסתיימה|נדחתה)/, reason: "Knesset session housekeeping" },
];

const all = await prisma.claim.findMany({
  where: {
    source: "כנסת · מליאה",
    status: { not: "rejected" },
  },
  select: { id: true, quote: true, politicianId: true },
});

let hit = 0;
const samples: string[] = [];
for (const c of all) {
  const q = c.quote.trim();
  for (const { regex, reason } of ROLLCALL_PATTERNS) {
    if (regex.test(q)) {
      await prisma.claim.update({
        where: { id: c.id },
        data: {
          status: "rejected",
          editorApproved: false,
          verifierNotes: `Auto-rejected: ${reason}`,
        },
      });
      hit++;
      if (samples.length < 8) samples.push(`  - "${q.slice(0, 80)}" → ${reason}`);
      break;
    }
  }
}

console.log(`${hit} Knesset procedural / roll-call claims rejected.`);
if (samples.length) {
  console.log("\nSample:");
  samples.forEach((s) => console.log(s));
}
await prisma.$disconnect();
