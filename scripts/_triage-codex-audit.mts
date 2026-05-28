/** Triage 3 specific claims flagged by Codex audit on 2026-05-28:
 *  - Miri Regev "כל ראש רשות": verdict=true but explanation admits limited verification
 *  - Yaakov Margi "בעד 16 ח״כ": vote tally (caught by sweep, but verdict=true was incoherent)
 *  - "ארבעה נרצחים מאז ערב יום העצמאות": explanation has wrong Yom HaAtzmaut 2026 date */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const targets = [
  {
    needle: "ארבעה נרצחים מאז ערב יום העצמאות",
    note: 'הוסר: ההסבר הסתמך על תאריך שגוי של ערב יום העצמאות 2026. נדרשת בדיקה חוזרת עם עיגון תאריך נכון.',
  },
];

for (const t of targets) {
  const matches = await p.claim.findMany({
    where: { quote: { contains: t.needle } },
    select: { id: true, quote: true, verdict: true, editorApproved: true, explanation: true, correctionNote: true, politicianId: true },
  });
  console.log(`\nNeedle "${t.needle.slice(0, 40)}…": ${matches.length} match(es)`);
  for (const c of matches) {
    console.log(`  [${c.verdict}] ${c.politicianId} ${c.id} approved=${c.editorApproved}`);
    console.log(`    quote: ${c.quote.slice(0, 120)}`);
    if (c.correctionNote) { console.log(`    SKIP: already has correctionNote`); continue; }
    if (APPLY && c.editorApproved) {
      await p.claim.update({
        where: { id: c.id },
        data: { editorApproved: false, correctionNote: t.note, correctedAt: new Date() },
      });
      console.log(`    ✗ hidden`);
    }
  }
}
if (!APPLY) console.log("\nDry run.");
await p.$disconnect();
