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
}

export async function editorialReview(
  claim: ClaimForEditorialReview,
): Promise<EditorialReviewResult> {
  const prompt = `אתה עורך בכיר באתר בדיקת עובדות פוליטי. טענה שבדיקת העובדות שלה כבר עברה אימות טכני הגיעה אליך להחלטה עורכת: **האם הטענה הזו ראויה להופיע באתר בדיקת עובדות?**

הטענה:
פוליטיקאי: ${claim.politicianName}
נושא: ${claim.topic}
ציטוט: "${claim.quote}"
פסק דין: ${claim.verdict}
${claim.summary ? `סיכום: ${claim.summary}\n` : ""}הסבר: ${claim.explanation}

**שאלה אחת: האם הטענה הזו מעניינת את הציבור כבדיקת עובדות?**

❌ דחה אם הטענה היא אחת מאלה:
1. **הודעת PR שגרתית של הפוליטיקאי על פעולה משלו** — "חתמתי על צו X היום", "הובלתי משלחת ל-Y", "אישרנו את התקציב ב-Z", "ביקרתי במחנה W". גם אם זה נכון עובדתית, אין בזה תוכן מחלוקתי שראוי לבדיקה.
2. **הודעה רשמית של ועדה/משרד** — "הוועדה החליטה להעביר את החוק", "המשרד הודיע על תוכנית". אלה דיווחים, לא טענות.
3. **תודות, הוקרות, ברכות** — "אני מודה ל-X על Y", "ברכותיי ל-Z על המינוי".
4. **עדכון אישי שלא בעניין הציבור** — "ביקרתי את חברי בבית החולים", "השתתפתי בחתונה".
5. **טריוויאל ניתן לאימות אך לא בעל ערך** — מקרים שבהם פסק הדין הוא "אמת" כי הפעולה אכן בוצעה, אך לקורא אין מה ללמוד מהבדיקה.

✅ אשר אם הטענה היא אחת מאלה:
1. **טענה מחלוקתית** — שני צדדים פוליטיים עשויים לחלוק על נכונותה.
2. **טענה סטטיסטית/עובדתית** — מספר, אחוז, השוואה, נתון שהציבור מרוויח מלדעת אם נכון או לא.
3. **התקפה מהותית על פוליטיקאי/מוסד אחר** — עם תוכן ספציפי (לא עלבון כללי).
4. **עמדה מדינית עם בסיס עובדתי** — שתומכת או מערערת תפיסה רווחת.
5. **כל דבר שבו קריאת הפסק נותנת לקורא מידע חדש ומועיל** מעבר לאישור שהפעולה התרחשה.

**הסטנדרט שמרני: בספק — אשר.** רק תדחה אם ברור שהטענה היא PR שגרתי או הודעה אישית טריוויאלית.

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
