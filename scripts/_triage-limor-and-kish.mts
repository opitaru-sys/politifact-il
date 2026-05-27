#!/usr/bin/env tsx
/** Manual triage of:
 *  - 26 Limor Son Har Melech claims flagged as historical-narrative /
 *    biographical / fragments / Knesset-procedure / PR. Most should
 *    have been caught by editor categories #1 / #4 / #6 / #7 / #8
 *    but slipped through (some pre-date the editor; the recent ones
 *    bypassed editor because of the 2026-05-27 Gemini quota outage).
 *  - 1 Yoav Kisch claim ("נתונים לא מאומתים") — 3-word fragment
 *    whose summary inflated it into a full sentence. Source-not-content
 *    failure mode against RAMA (a professional institution).
 *
 *  Each gets hidden with a per-category correctionNote. Idempotent —
 *  skips claims that already have a correctionNote.
 */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;
const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();

const APPLY = process.argv.includes("--apply");

type Target = { id: string; reason: string; category: string };
const targets: Target[] = [
  // === Limor Son Har Melech: historical / biographical / encyclopedic ===
  { id: "cmpnygfc9001r3h864s1ir0ju", category: "biographical", reason: "הוסר: סיפור ביוגרפי אישי על סבתא של הח״כ, לא טענה פוליטית מהותית." },
  { id: "cmpnyg9k500173h86kvzr4c9b", category: "historical", reason: "הוסר: עובדה היסטורית-אנציקלופדית ידועה (קהילת יהודי עיראק העתיקה), לא טענה פוליטית הניתנת למחלוקת." },
  { id: "cmpnygdf0001j3h86pyptrby6", category: "historical", reason: "הוסר: נרטיב היסטורי כללי על הפרהוד, לא טענה פוליטית של הח״כ הניתנת לאימות עצמאי." },
  { id: "cmpnyg9ro00193h86yuhr5160", category: "historical", reason: "הוסר: עובדה היסטורית ידועה (התרחשות הפרהוד), לא טענה פוליטית של הח״כ." },
  { id: "cmpnyg8rp00153h86f61x5dsq", category: "historical", reason: "הוסר: עובדה היסטורית-דתית ידועה (התלמוד הבבלי), לא טענה פוליטית." },
  { id: "cmpnylsou002r3h86foy70f0p", category: "historical", reason: "הוסר: רשימה של רבנים בולטים מיהדות עיראק, מידע דתי-היסטורי ולא טענה פוליטית." },
  { id: "cmpnyg0oy00133h86lcec5trd", category: "about-other-mk", reason: "הוסר: תיאור פעולה של ח״כ אחר (אופיר כץ), לא טענה של הדוברת על מדיניות." },
  { id: "cmpfyh0bi02un8zp8ufepkmwq", category: "historical-narrative", reason: "הוסר: נרטיב היסטורי-אידיאולוגי על 'אלפיים שנות שממה' (פסק שקר), לא טענה פוליטית מהותית הניתנת לדיון ענייני." },
  { id: "cmpfygw0t02ul8zp8no0xeslx", category: "trivial", reason: "הוסר: התייחסות שגרתית לפרשת השבוע, לא טענה ציבורית מהותית." },
  { id: "cmpfygu7502uh8zp88pqedq5s", category: "trivial", reason: "הוסר: התייחסות שגרתית ליום השואה הבין-לאומי (פסק שקר על תזמון בלבד), לא טענה ציבורית מהותית." },

  // === Limor: fragments without context ===
  { id: "cmpns7ryd000u3e22sfywyapq", category: "fragment", reason: "הוסר: ציטוט קצר חסר הקשר (״הגיעו ליישב את המקום״ ללא פירוט המקום), לא ניתן לאמת או להציג לציבור באופן מועיל." },
  { id: "cmpns7vpj00143e22ml6c9ckp", category: "fragment", reason: "הוסר: ציטוט קצר חסר הקשר (״המקום כשטח B״ ללא פירוט המקום), לא ניתן לאמת באופן עצמאי." },
  { id: "cmpns7t2k000w3e22kgwrcrs6", category: "fragment", reason: "הוסר: ציטוט קצר חסר הקשר (״ההר השני בגובהו בשומרון״ ללא ציון איזה הר), לא ניתן לאמת." },

  // === Limor: Knesset chamber procedure ===
  { id: "cmpfnkqu900el4d30vqkhex4g", category: "procedural", reason: "הוסר: ספירת הצבעה במליאת הכנסת (״בעד הודעת הממשלה - 46״), פעולה פרוצדורלית, לא טענה." },
  { id: "cmpfmxgsp00594d303tmou1uk", category: "procedural", reason: "הוסר: תיאור פרוצדורלי של דיון במליאה, לא טענה מהותית." },
  { id: "cmpfored4009t8zp8b19elirb", category: "procedural", reason: "הוסר: הפניה למסמך פנימי בכנסת (״פרק ו׳ להצעת החוק שבפניכם״), אינה טענה הניתנת לאימות ציבורי." },
  { id: "cmpg0i8y9039z8zp8hch9lofh", category: "procedural", reason: "הוסר: ספירת הצבעה (״שמונה בעד, שלושה מתנגדים״), פעולה פרוצדורלית." },
  { id: "cmpg0fnlm039b8zp8u0vog5d4", category: "procedural", reason: "הוסר: הקראת הודעת ממשלה פרוצדורלית, לא טענה." },
  { id: "cmpg0g6d7039n8zp81mhog2o4", category: "procedural", reason: "הוסר: הקראת הודעת ממשלה על העברת סמכויות ביומטריות, פעולה פרוצדורלית." },
  { id: "cmpg4fsk0044l8zp8u73nef57", category: "procedural", reason: "הוסר: ספירת הצבעה (״25 בעד, 59 נגד״), פעולה פרוצדורלית." },
  { id: "cmpg0ieix03a38zp80dpbmt0x", category: "procedural", reason: "הוסר: הקראת בקשת ממשלה להאריך תוקף חוק, פעולה פרוצדורלית." },
  { id: "cmpg0igaj03a58zp8rtpt712e", category: "procedural", reason: "הוסר: הקראת בקשת ממשלה להאריך תוקף חוק (כפילות), פעולה פרוצדורלית." },
  { id: "cmpfuyf4901x18zp80vzed9hs", category: "thanks-and-false", reason: "הוסר: פתיחה בהודאה אישית (״מבקשת להודות״) שמכילה גם הצהרה שגויה (״הראשון שהגיש את החוק״). PR + טעות עובדתית, לא טענה ראויה לפרסום." },
  { id: "cmpg7z3kw050h8zp81pf1oolg", category: "procedural", reason: "הוסר: רשימת חברי כנסת שהגישו הצעה (פסק שקר על הרכב הקבוצה), מידע פרוצדורלי-מנהלי שאינו טענה ציבורית מהותית." },

  // === Limor: borderline (lean-hide) ===
  { id: "cmpns7xuu00183e222drz53cb", category: "visit-pr", reason: "הוסר: הודעת PR על ביקור אישי של הח״כ ביישוב (״השבוע ביקרתי״), לא טענה ניתנת לאימות." },
  { id: "cmpg1ylpe03kf8zp8eoori33d", category: "personal-anecdote", reason: "הוסר: סיפור אישי על חברה של הח״כ שנפצעה, לא טענה ציבורית הניתנת לאימות פומבי." },

  // === Yoav Kisch (separate politician, same failure mode) ===
  { id: "cmpo67ybj000zqdxni3wr3qvy", category: "fragment-and-characterization", reason: "הוסר: הציטוט עצמו הוא רק שלוש מילים (״נתונים לא מאומתים״), והסיכום הרחיב אותם להצהרה שלמה. הפסק ״אמת״ אומת רק שקיש אכן אמר את המילים, לא שתוכן הטענה (שנתוני ראמ״ה אכן בלתי מהימנים) נכון. ראמ״ה היא רשות מקצועית עצמאית; הצגת התקפה פוליטית עליה כ״עובדה אמיתית״ מטעה את הקורא." },
];

console.log(`Triaging ${targets.length} claims (${APPLY ? "APPLY" : "dry-run"})\n`);

let touched = 0;
let skipped = 0;

for (const t of targets) {
  const claim = await p.claim.findUnique({
    where: { id: t.id },
    select: { id: true, politicianId: true, quote: true, editorApproved: true, correctionNote: true },
  });
  if (!claim) {
    console.log(`  ⚠ MISSING: ${t.id}`);
    continue;
  }
  if (claim.correctionNote) {
    console.log(`  ⊘ SKIP (already has note): ${t.id} | ${claim.quote.slice(0, 60)}`);
    skipped++;
    continue;
  }
  console.log(`  ✗ [${t.category}] ${claim.politicianId} | ${claim.quote.slice(0, 80)}`);
  if (APPLY) {
    await p.claim.update({
      where: { id: t.id },
      data: {
        editorApproved: false,
        correctionNote: t.reason,
        correctedAt: new Date(),
      },
    });
    touched++;
  }
}

console.log(`\n${touched} hidden, ${skipped} already corrected.`);
if (!APPLY) console.log("Dry run. --apply to commit.");
await p.$disconnect();
