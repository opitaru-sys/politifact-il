/**
 * Third-pass AI: editorial newsworthiness review.
 *
 * The technical verifier (verify-claim.ts) asks "is this claim true and
 * well-reasoned?" — it can't tell the difference between a contested
 * political claim worth a fact-check and a routine government PR
 * announcement that's trivially true. Both pass.
 *
 * This module adds an editor's question: "is this worth publishing as a
 * fact-check?" Returns reject for routine self-action / press releases /
 * ceremonial speech / personal updates that have no public interest
 * beyond confirming the action happened. Approve for anything
 * contested, statistically substantive, or substantively engaging with
 * another politician's claims.
 *
 * Conservative dial — when in doubt, approve. Roughly 10-20% of
 * currently-approved claims expected to be rejected by this layer.
 *
 * Cost: ~$0.001/claim (no grounding needed — pure judgment call on
 * already-verified content).
 */
import { GoogleGenAI, Type } from "@google/genai";
import { getEnvVar } from "./env";

function getGemini() {
  const apiKey = getEnvVar("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not found");
  return new GoogleGenAI({ apiKey });
}

const MODEL = "gemini-2.5-flash";

export interface EditorialReviewResult {
  /** False if this claim shouldn't be on the public site even though it's
   *  technically true / well-verified. */
  approved: boolean;
  /** Editorial reason — used as the rejection note in `verifierNotes`. */
  reason: string;
}

export interface ClaimForEditorialReview {
  quote: string;
  verdict: "true" | "half-true" | "false";
  summary?: string | null;
  explanation: string;
  politicianName: string;
  topic: string;
  /**
   * When the quote was actually said. Needed for the editor to detect
   * retroactive verdicts (criterion 9) — explanations that reject a
   * claim based on facts that only became true AFTER the quote was made.
   */
  claimDate?: Date | null;
}

export async function editorialReview(
  claim: ClaimForEditorialReview,
): Promise<EditorialReviewResult> {
  const claimDateLine = claim.claimDate
    ? `תאריך הציטוט: ${claim.claimDate.toISOString().split("T")[0]} (חשוב לקטגוריית דחייה 9 — שיפוט retroactive)\n`
    : "";
  const prompt = `אתה עורך בכיר באתר בדיקת עובדות פוליטי. טענה שבדיקת העובדות שלה כבר עברה אימות טכני הגיעה אליך להחלטה עורכת: **האם הטענה הזו ראויה להופיע באתר בדיקת עובדות?**

הטענה:
פוליטיקאי: ${claim.politicianName}
נושא: ${claim.topic}
${claimDateLine}ציטוט: "${claim.quote}"
פסק דין: ${claim.verdict}
${claim.summary ? `סיכום: ${claim.summary}\n` : ""}הסבר: ${claim.explanation}

**שאלה אחת: האם הטענה הזו מעניינת את הציבור כבדיקת עובדות?**

❌ דחה אם הטענה היא אחת מאלה:
1. **הודעת PR שגרתית של הפוליטיקאי על פעולה משלו** — "חתמתי על צו X היום", "הובלתי משלחת ל-Y", "אישרנו את התקציב ב-Z", "ביקרתי במחנה W". גם אם זה נכון עובדתית, אין בזה תוכן מחלוקתי שראוי לבדיקה.
2. **הודעה רשמית של ועדה/משרד** — "הוועדה החליטה להעביר את החוק", "המשרד הודיע על תוכנית". אלה דיווחים, לא טענות.
3. **תודות, הוקרות, ברכות** — "אני מודה ל-X על Y", "ברכותיי ל-Z על המינוי".
4. **עדכון אישי שלא בעניין הציבור** — "ביקרתי את חברי בבית החולים", "השתתפתי בחתונה".
5. **טריוויאל ניתן לאימות אך לא בעל ערך** — מקרים שבהם פסק הדין הוא "אמת" כי הפעולה אכן בוצעה, אך לקורא אין מה ללמוד מהבדיקה.
6. **תיאור אירוע חדשותי שקרה (לא טענה של הפוליטיקאי)** — דגל חשוב במיוחד. הפוליטיקאי מספר על אירוע שהתרחש (רצח, פיגוע, תאונה, החלטה משפטית, פעולת משטרה). הציטוט תוכנו פרשני-חדשותי, לא טענה אישית של הפוליטיקאי שאמינותו על המדף. בדיקת האם האירוע אכן קרה אינה בדיקת אמינות של הפוליטיקאי.
   דוגמאות לדחייה:
   - "הצעיר X נרצח לפני שבועיים בעיר Y" — אירוע ידוע, לא טענה אישית.
   - "המשטרה עצרה את הפושעים והגישה כתבי אישום" — דיווח חדשותי, לא טענה.
   - "ראש הממשלה התייחס לאירוע X בפתח ישיבת הממשלה" — דיווח על פעולה פומבית שגרתית.
   - "המפכ"ל נתן הוראה להאיץ את החקירה" — דיווח על פעולה רגילה של פקיד ציבור.
   הבחנה: אם הפוליטיקאי **טוען טענה ספציפית הניתנת למחלוקת על האירוע** (למשל "המשטרה התרשלה בחקירה" עם נתון תומך), אשר. אם הוא רק **חוזר על הנרטיב הציבורי המוכר**, דחה.
7. **הודעות ארגוניות / פוליטיות-טכניות** — דגל חשוב במיוחד. הקמת רשימה, הסכם בין סיעות, הגשת הצעת חוק, פגישות פנימיות. אלה ארגוניות, לא מהותיות. הפוליטיקאי מתאר פעולה ארגונית שהוא ביצע — לא טוען טענה הניתנת לבדיקה ציבורית.
   דוגמאות לדחייה:
   - "סיעות X, Y, Z הסכימו להקים רשימה משותפת" — הודעה ארגונית.
   - "הגשנו הצעת חוק בנושא Z" — תיאור פעולה, לא טענה.
   - "התקיימה פגישה בין מפלגתנו לבין מפלגת Y" — דיווח על אירוע ארגוני.
   - "אנחנו מקימים ועדה לבדיקת Z" — הודעת PR, לא טענה.
8. **טריוויה על אנשים שאינם פוליטיקאים** — דגל חשוב במיוחד. בדיקת עובדות ביוגרפיות על דמויות שאינן פוליטיקאיות (קורבנות אלימות, ספורטאים, אמנים, אקדמאים, אזרחים פרטיים). גם אם נכון, לא רלוונטי לאמינות הפוליטיקאי שאמר את הציטוט.
   דוגמאות לדחייה:
   - "X לא היה שחקן כדורגל" — מי שאינו פוליטיקאי, לא רלוונטי.
   - "Y הוא אמן ידוע" — דיווח על אדם שאינו דמות פוליטית.
   - "Z היה חייל בגדוד W" — מידע ביוגרפי על קורבן, לא טענה פוליטית.
   הבחנה: אם הפוליטיקאי משתמש בעובדה הביוגרפית **כראיה לטענה פוליטית מהותית** (למשל "X לא היה ערבי, כפי שטענו, אלא יהודי" כראיה למשהו), שקול לפי הטענה הפוליטית. אם זה רק עובדה ביוגרפית בפני עצמה, דחה.
9. **שיפוט retroactive — הפסק מתבסס על עובדות שקרו אחרי שהציטוט נאמר** — דגל חשוב במיוחד. ההסבר משתמש בנתונים/אירועים שהיו ידועים רק לאחר שהציטוט נאמר, כדי לקבוע verdict שקר/חצי-אמת. הציטוט נאמר בזמן מסוים — אם בזמן ההוא היה נכון, הוא נכון. אסור לפרסם "שקר" על טענה שהפכה לא רלוונטית בגלל אירועים מאוחרים.
   דוגמאות לדחייה:
   - "מוחמד עודה הוא ראש הזרוע הצבאית של חמאס" (נאמר בבוקר) — verdict "שקר" כי "עודה חוסל אותו יום ולכן אינו מנהיג עוד". בזמן הציטוט הוא היה מנהיג. **דחה.**
   - הציטוט מציג מצב הווה (נאמר אתמול), וההסבר מסתמך על מה שהשתנה היום. **דחה.**
   - ציטוט שמתאר משא ומתן/מגעים פעילים — וההסבר מציין שיותר מאוחר נכשלו. **דחה.**
   סימני זיהוי בהסבר: "באותו יום", "מאוחר יותר", "מאז", "התעדכן", "לאחר מכן", "בפועל" — בהקשר של אירועים שקרו אחרי הציטוט.
   הבחנה: ציטוט שהוא תחזית מפורשת ("יקרה X בעוד חודש") + עובדות מאוחרות שמראות שלא קרה — אישור לגיטימי, זו תחזית שלא התממשה.
10. **טענה אפיונית/פרשנית של אחר — אומת רק שנאמרה, לא שהאפיון נכון** — דגל חשוב במיוחד. הציטוט הוא **אפיון / פרשנות / מסקנה מוסרית** של פעולה של אדם אחר, וההסבר מאשר רק (א) שהציטוט אכן נאמר, ו/או (ב) שהפעולה הראשונית של האחר אכן קרתה — אבל לא מאמת את האפיון עצמו. הציבור מקבל אישור "אמת" שמטעה — הוא חושב שהאפיון מאומת.
   דוגמאות לדחייה:
   - "דן חלוץ הכשיר סרבנות" — verdict "אמת" כי הציטוט נאמר + חלוץ אמר משהו על סרבנות. אבל "הכשיר" — פרשנות. **דחה.**
   - "ראש הממשלה הפקיר את החטופים" — verdict "אמת" כי יש קשיים במו"מ. אבל "הפקיר" — אפיון מוסרי. **דחה.**
   - "X הסית נגד ערבים בנאומו" — verdict "אמת" כי דבריו תועדו. אבל "הסית" — מסקנה משפטית. **דחה.**
   סימני זיהוי:
   - פועל אפיוני בציטוט: **הכשיר, אישר, תמך, עודד, הסית, ביזה, גינה, הפקיר, בגד, חיזק, החליש, הזניח, הוביל, נכשל**.
   - ההסבר מאשר רק שהציטוט נאמר או שהפעולה הראשונית קרתה — בלי לבסס את האפיון.
   הבחנה: אם הציטוט מציג **ראיות ספציפיות** התומכות באפיון ("חלוץ הכשיר סרבנות כשאמר '...' ב-5.3"), אישור — יש מה לאמת. בלי ראיות, האפיון פרשני בלבד.

✅ אשר אם הטענה היא אחת מאלה:
1. **טענה מחלוקתית מהותית** — שני צדדים פוליטיים עשויים לחלוק על נכונותה. הטענה משקפת עמדה של הפוליטיקאי על נושא ציבורי.
2. **טענה סטטיסטית/עובדתית מהותית** — מספר, אחוז, השוואה, נתון על מדיניות ציבורית. הציבור מרוויח לדעת אם נכון. הציטוט אינו תיאור אירוע חדשותי או דיווח על פעולה ארגונית.
3. **התקפה מהותית על פוליטיקאי/מוסד אחר** — עם תוכן ספציפי (לא עלבון כללי, לא דיווח חדשותי).
4. **עמדה מדינית עם בסיס עובדתי** — שתומכת או מערערת תפיסה רווחת. הציטוט מבטא דעה/עמדה של הפוליטיקאי, לא תיאור אירוע.
5. **טענה שאישורה או הפרכתה משקפת על אמינות הפוליטיקאי על נושאי מדיניות מהותיים.** לא "מידע חדש על העולם בכלל", אלא "מידע חדש על מה שהפוליטיקאי טוען בנוגע למדיניות".

**הסטנדרטים — שונים לפי קטגוריה:**
- בספק לגבי קטגוריות 1-5 (PR / ועדה / תודות / אישי / טריוויאל): **אשר.** דחה רק כשברור.
- בספק לגבי קטגוריות 6-8 (אירוע חדשותי / ארגוני / טריוויה על לא-פוליטיקאי): **דחה.** הקטגוריות האלה נוטות לדלל את מדד האמינות עם תוכן שאינו טענה אישית של הפוליטיקאי. דחה אלא אם הציטוט באמת מכיל טענה מהותית של הפוליטיקאי על מדיניות.
- בספק לגבי קטגוריות 9-10 (שיפוט retroactive / טענה אפיונית): **דחה.** אלה פגמים יסודיים באמינות הבדיקה עצמה — verdict שגוי שמתפרסם בפומבי. עדיף להוריד טענה ספציפית מאשר לתת לקורא בדיקה שאינה משקפת את האמת.

החזר JSON: {"approved": boolean, "reason": "סיבת הדחייה בעברית (אם נדחתה), או הסבר קצר למה אושרה"}`;

  try {
    const response = await getGemini().models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            approved: { type: Type.BOOLEAN },
            reason: { type: Type.STRING },
          },
          required: ["approved", "reason"],
        },
      },
    });
    const text = response.text ?? "";
    if (!text.trim()) throw new Error("Empty response from Gemini editor");
    const parsed = JSON.parse(
      text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, ""),
    ) as { approved: boolean; reason: string };
    return {
      approved: parsed.approved === true,
      reason: String(parsed.reason || ""),
    };
  } catch (err) {
    console.error("Editorial review failed:", err);
    // Fail open: if the editor errors, don't block the claim. The verifier
    // already approved it. We don't want a transient API hiccup to wipe
    // legitimate claims off the site.
    return { approved: true, reason: "שגיאה בעורך — אישור אוטומטי" };
  }
}
