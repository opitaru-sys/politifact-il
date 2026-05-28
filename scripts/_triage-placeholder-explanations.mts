/** Hide claims with fact-check placeholder explanations that leaked
 *  past the verifier (today's quota outage let 8 slip through). The
 *  upstream catch-block + new guard prevents this going forward. */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const NEEDLES = [
  "טעונה בדיקה ידנית",
  "נדרשת בדיקה ידנית",
  "ההסבר חסר",
  "לא ניתן לבדוק טענה זו באופן אוטומטי",
];

const NOTE =
  'הוסר: ההסבר התקבל מבדיקה אוטומטית שכשלה (קריאה ל-AI נחסמה בגלל מכסה או שגיאת רשת). לא בוצעה בדיקת עובדות אמיתית. הציטוט יוחזר לפייפליין לבדיקה חוזרת.';

// Build OR-OR query so a single row matching any needle on summary
// or explanation is returned once.
const visible = await p.claim.findMany({
  where: {
    OR: NEEDLES.map((needle) => ({
      OR: [{ explanation: { contains: needle } }, { summary: { contains: needle } }],
    })),
    editorApproved: true,
    status: "published",
  },
  select: { id: true, politicianId: true, verdict: true, quote: true, correctionNote: true },
});

console.log(`Found ${visible.length} visible placeholder claims (${APPLY ? "APPLY" : "dry-run"})`);
let hidden = 0;
for (const c of visible) {
  console.log(`  [${c.verdict}] ${c.politicianId} ${c.id}`);
  console.log(`    ${c.quote.slice(0, 100)}`);
  if (c.correctionNote) {
    console.log(`    SKIP: already has correctionNote`);
    continue;
  }
  if (APPLY) {
    await p.claim.update({
      where: { id: c.id },
      data: { editorApproved: false, correctionNote: NOTE, correctedAt: new Date() },
    });
    hidden++;
  }
}

if (APPLY) console.log(`\n${hidden} claims hidden.`);
else console.log("\nDry run. --apply to commit.");

await p.$disconnect();
