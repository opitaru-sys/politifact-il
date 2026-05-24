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
  { regex: /^חבר(?:ת)? הכנסת .{1,80}[-–]\s*איננ[וה]\s*[\.\)]?$/, reason: "Knesset roll-call: attendance marker" },
  { regex: /לא נוכח[ת]?\s*$/, reason: "Knesset roll-call: not present" },
  { regex: /^נוכחים?:/, reason: "Knesset roll-call: presence list" },
  { regex: /^נעדרים?:/, reason: "Knesset roll-call: absentee list" },
  { regex: /הצבעה (מס׳|מספר|מס\.) \d+/, reason: "Knesset vote-number header" },
  { regex: /(ההצבעה|ההצעה|ההסתייגויות?) .{0,40}(התקבלה|נדחתה|התקבלו|נדחו)\s*[\.\)]?\s*$/, reason: "Knesset vote outcome line" },
  // Vote tallies — "בעד - 50" / "נגד - 32" / "נמנעים - 2"
  { regex: /^(בעד|נגד|נמנעים?)\s*[-–]\s*\d+\s*$/, reason: "Knesset vote tally" },
  { regex: /^בעד\s*[-–]\s*\d+\s+חברי כנסת,\s*אין מתנגדים,\s*נמנע(?:ים)? אחד\.?$/, reason: "Knesset vote tally" },
  { regex: /^חברי הכנסת,\s*בעד הצביעו \d+,\s*נגד \d+,\s*\S+ נמנעים?\.?\s*אי[- ]לכך אני קובע כי/i, reason: "Knesset vote tally with outcome" },
  { regex: /^בעד הצעת החוק הצביעו \d+ חברי כנסת\.\s*נגד\s*[-–]\s*\d+/i, reason: "Knesset vote tally with outcome" },
  { regex: /^בעד\s*[-–]\s*\d+,\s*נגד\s*[-–]\s*\d+\.?\s*אני קובע/i, reason: "Knesset vote tally with outcome" },
  { regex: /^בעד סעיף .{1,160}נגד\s*[-–]\s*\d+.*(נתקבל|נדחה|אושר)/i, reason: "Knesset vote tally with outcome" },
  { regex: /^בעד החוק\s*[-–]\s*\d+\s+נגד\s*[-–]\s*\d+.*(נתקבל|נדחה|אושר)/i, reason: "Knesset vote tally with outcome" },
  { regex: /^בעד ההצעה להעביר .{1,260}נגד\s*[-–]\s*\d+.*(נתקבל|נדחה|אושר)/i, reason: "Knesset vote tally with outcome" },
  { regex: /^בעד .{1,120}\s*[-–]\s*\d+\s*$/, reason: "Knesset vote tally with subject" },
  { regex: /^בעד\s*[-–]\s*[^,]{1,80},\s*אין מתנגדים,\s*אין נמנעים\s*[\.\)]?$/, reason: "Knesset vote tally" },
  { regex: /^בעד החוק\s*[-–]\s*\d+\s+נגד\s*[-–]\s*אין\s+נמנעים\s*[-–]\s*אין/i, reason: "Knesset vote tally" },
  { regex: /^(אין מתנגדים|אין נמנעים|אין מצביעים)\s*[\.\)]?\s*$/, reason: "Knesset null-vote line" },
  // Section / clause acceptance — "סעיפים 1-3 נתקבלו", "סעיף 4 נדחה"
  { regex: /^סעיפ?י?ם?\s+[\dא-ת\-\,–\s]{1,30}\s+(נתקבלו|נתקבל|נדחו|נדחה|אושרו|אושר)\s*[\.\)]?\s*$/, reason: "Knesset section acceptance" },
  // "פה אחד" / "ברוב קולות" outcome lines without context
  { regex: /^(פה אחד|ברוב קולות|בקריאה (ראשונה|שנייה|שלישית))\s*[\.\)]?\s*$/, reason: "Knesset vote modality line" },
  // Generic procedural lines that the extractor sometimes promotes
  { regex: /^(הישיבה|הדיון|הוועדה) .{0,40}(נפתחה|ננעלה|הסתיימה|נדחתה)/, reason: "Knesset session housekeeping" },
  // "אני נועל את הישיבה" type
  { regex: /(נועל|נועלת|פותח|פותחת) את (הישיבה|הדיון)/, reason: "Knesset session housekeeping" },
  { regex: /^זה כבר היום יום ההולדת/, reason: "Knesset ceremonial speech" },
  { regex: /^לרשותך,? כמובן,? אדוני,? עד /, reason: "Knesset speaking-time management" },
  { regex: /הצעה שמית/, reason: "Knesset voting procedure" },
  // Chair agenda / invitation lines. These describe the meeting flow, not public factual claims.
  { regex: /^(אנחנו|אנו|נעבור|חברי הכנסת).{0,80}(עוברים|ניגשים|נעבור|עובר|עומדים).{0,160}(סדר.?היום|להצבעה|קריאה)/, reason: "Knesset agenda/procedure line" },
  { regex: /^נעבור לנושא הבא (ש)?(על|ב)סדר.?היום/, reason: "Knesset agenda/procedure line" },
  { regex: /^אני מזמי[ןנה] את .{0,180}(להציג|לנמק|לדבר|לעלות)/, reason: "Knesset chair invitation" },
  { regex: /^אבל תחילה אני אזמי[ןנה] את .{0,180}(להציג|לנמק|לדבר|לעלות)/, reason: "Knesset chair invitation" },
  { regex: /^(הנושא הראשון|הנושא הבא) שעל סדר.?היום/, reason: "Knesset agenda/procedure line" },
  { regex: /^להצעת החוק הוצמדו .{0,220}(אני מזמי[ןנה]|תודה)/, reason: "Knesset agenda/procedure line" },
  { regex: /^אני קובע כי הצעת החוק אושרה בקריאה/, reason: "Knesset vote outcome line" },
  { regex: /^הצעת .{1,180}(התקבלה|נתקבלה|אושרה).{0,80}(קריאה|ספר החוקים)/, reason: "Knesset vote outcome line" },
  { regex: /^הצעת .{1,260}(לא אושרה|תוסר מסדר.?היום)/, reason: "Knesset vote outcome line" },
  { regex: /^ההצעה להעביר את הצעת .{1,260}(נתקבלה|לא נתקבלה|נדחתה)/, reason: "Knesset vote outcome line" },
  { regex: /^הצעת (חוק|ועדת) .{1,260}(של חברת הכנסת|של חבר הכנסת|וקבוצת חברי כנסת|בדבר תיקון טעות)/, reason: "Knesset bill-title/procedure line" },
  { regex: /^הצעת חוק .{1,220}התשפ["״][א-ת][-–]\d{4}\s*$/, reason: "Knesset bill-title/procedure line" },
  { regex: /^הצעת חוק .{1,220}\(קריאה שנייה וקריאה שלישית\)/, reason: "Knesset agenda/procedure line" },
  { regex: /^חוק .{1,180}(התקבל|נתקבל|אושר)\s*[\.\)]?$/, reason: "Knesset vote outcome line" },
  { regex: /^חבר הכנסת .{1,80}יושב[- ]ראש ועדת/, reason: "Knesset role-identification line" },
  { regex: /^הצעת חוק .{1,180}\(קריאה (ראשונה|שנייה|שלישית)\)\s*$/, reason: "Knesset agenda/procedure line" },
  { regex: /^נעבור להצבעה בקריאה/, reason: "Knesset agenda/procedure line" },
  { regex: /^להצעת החוק הוצמד[וה] .{1,260}בדיון מוקדם/, reason: "Knesset agenda/procedure line" },
  { regex: /^את ההצעה הגיש חבר הכנסת/, reason: "Knesset bill-title/procedure line" },
  { regex: /^ההצעה הראשונה היא הצעה רגילה לסדר.?היום/, reason: "Knesset agenda/procedure line" },
  // Pure thanks / chairmanship niceties
  { regex: /^(תודה רבה|בבקשה|אנא רשמו לפרוטוקול)\s*[,\.]?\s*(אדוני |אדונית )?(היו"ר|היושב.ראש|חברת הכנסת|חבר הכנסת)?\s*[\.\)]?\s*$/, reason: "Knesset ceremonial speech" },
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
