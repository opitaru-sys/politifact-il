/**
 * Second-pass AI verifier.
 *
 * After a claim has been extracted and fact-checked by the primary pipeline,
 * this module re-examines it with an adversarial prompt: a senior reviewer
 * who looks for reasons NOT to approve. Returns a structured verdict.
 *
 * Cost: ~1 message per claim, ~1500 input + 300 output tokens (≈ $0.01).
 *
 * The verifier intentionally uses different framing from the original
 * fact-check — adversarial, skeptical, looking for issues rather than
 * confirming. This is the "second pair of eyes" the original lacks.
 */
import Anthropic from "@anthropic-ai/sdk";
import { getEnvVar } from "./env";

function getAnthropic() {
  const apiKey = getEnvVar("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not found");
  return new Anthropic({ apiKey });
}

export interface VerificationResult {
  approved: boolean;
  /** Verifier's own confidence in its decision, 0-1. Not related to the original AI confidence. */
  confidence: number;
  /** Issues found if not approved. Empty array if approved. Joined with "; " for storage. */
  issues: string[];
}

export interface ClaimToVerify {
  quote: string;
  verdict: "true" | "half-true" | "false";
  summary?: string | null;
  explanation: string;
  source: string;
  factSource?: string | null;
  politicianName: string;
  topic: string;
}

export async function verifyClaim(claim: ClaimToVerify): Promise<VerificationResult> {
  const today = new Date();
  const todayIso = today.toISOString().split("T")[0];
  const response = await getAnthropic().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    messages: [
      {
        role: "user",
        content: `**הקשר זמני קריטי:** היום ${todayIso}. שים לב שמודל הבדיקה הקודם עלול להיות לא מודע לאירועים שקרו לאחר תאריך החיתוך של נתוני האימון שלו, ולכן עלול לטעות ולקשר טענה על אירוע חדש לאירוע דומה ישן.

אתה עורך בכיר באתר בדיקת עובדות, ומאשר/דוחה בדיקות שעברו אליך לאישור סופי לפני פרסום. הסטנדרט שלך: דחה רק כשיש פגם ברור. אל תדחה רק כי משהו אינו מושלם.

הטענה שנבדקה:
פוליטיקאי: ${claim.politicianName}
נושא: ${claim.topic}
ציטוט: "${claim.quote}"
פסק הדין שניתן: ${claim.verdict}
${claim.summary ? `סיכום קצר: ${claim.summary}\n` : ""}הסבר מלא: ${claim.explanation}
מקור הציטוט: ${claim.source}
${claim.factSource ? `מקור הבדיקה שצוין: ${claim.factSource}` : ""}

תסיבות לדחייה — דחה רק אם אחת מאלה נכונה:
1. **פסק הדין סותר את ההסבר** — למשל פסק "אמת" כאשר ההסבר מציג את הטענה כשגויה, או "שקר" כאשר ההסבר תומך בטענה.
2. **הטיה פוליטית בולטת** — ההסבר משתמש בלשון רטורית/שיפוטית מובהקת ("הפוליטיקאי משקר", "באופן ציני", "מסיתים"). הצגת עובדות נגד הטענה אינה הטיה.
3. **סתירה פנימית** — ההסבר אומר X ואז אומר את ההפך של X.
4. **הציטוט הוא בבירור פרפרזה עיתונאית בלשון נסתר** — למשל "הוא אמר שלפי דעתו..." (פרפרזה) לעומת ציטוט ישיר במרכאות. אם הציטוט בלשון ישירה ובגוף ראשון — אישור.
5. **חסר הקשר עובדתי לחלוטין** — ההסבר עמום לחלוטין ללא נתון, תאריך, אירוע, או מקור.
6. **בלבול זמני / אירוע לא נכון** — דגל אדום קריטי. ההסבר מתייחס לאירוע מתאריך אחר ממה שהטענה מתייחסת אליו. סימנים אופייניים:
   - הטענה מדברת על אירוע אקטואלי (משט, חיסול, ועדה, מבצע, פיגוע) אך ההסבר מצטט עובדות מאירוע דומה משנים קודמות (למשל ההסבר מזכיר "מבצע צוק איתן 2014" או "המשט ב-2010" כאילו הם הנושא).
   - ההסבר נשמע בטוח לגבי עובדות שהוא לא יכול לדעת (אירוע שקרה השבוע) — סימן שהוא ממציא או מערבב עם אירוע אחר.
   - יש פער בלתי מוסבר בין הציטוט (חדש) לבין הראיות בהסבר (ישנות).
   במקרה כזה: דחה, ציין במפורש בבעיות "בלבול עם אירוע ישן" או "ההסבר לא רלוונטי לאירוע הנכון".
7. **אישור "אמת" של ציטוט ללא תוכן עובדתי** — דגל קריטי. הפסק דין צריך להתייחס לתוכן העובדתי של הטענה (האם הנתון/האירוע/הפעולה נכונים בעולם), **לא** לאם הפוליטיקאי באמת אמר את המילים. סימנים שזיהית את הבאג:
   - הציטוט הוא דעה/רטוריקה/סלוגן/האשמה כללית ללא נתון או אירוע ספציפי. דוגמאות: "הם תומכי טרור", "נגמרה הקייטנה", "אנחנו ננצח", "זה בזוי", "מקווה ש...".
   - ההסבר מצדיק "אמת" באמירות כמו "הציטוט מדויק", "הוא אכן אמר את זה", "המילים שלו", "אמירה מאומתת" — אבל לא מאמת **תוכן** עובדתי.
   - אין בהסבר נתון, סטטיסטיקה, מקור רשמי, או אירוע ספציפי שמאשר את **התוכן** של הציטוט (כי אין תוכן).
   במקרה כזה: דחה. ציין בבעיות "אין תוכן עובדתי לאמת בציטוט" או "הפסק מתייחס לאם אמר, לא למה אמר". זה רלוונטי גם לפסק "שקר" - אם אין מה לאמת, אסור לתת לציטוט verdict בכלל.

**אישור:** אם אף סיבה למעלה לא חלה, אישור. סטנדרטים מציאותיים:
- מקור עיתונאי (Ynet, מעריב, הארץ, ישראל היום, וואלה) הוא לגיטימי לציטוטים — *כך* פוליטיקאים מדברים לציבור.
- "מקור בדיקה" שאינו ספציפי לחלוטין (למשל "פרוטוקולי כנסת" ללא מספר) — לגיטימי. בדיקת עובדות מציאותית אינה תמיד מצטטת עמוד וספר.
- פסק דין "חצי אמת" עבור טענה מורכבת — לגיטימי גם אם פרטים מסוימים לא נבדקו.
- ההסבר מודה בחוסר וודאות מסוים — לגיטימי, זו יושרה אינטלקטואלית.

החזר JSON בלבד:
{
  "approved": true/false,
  "confidence": 0.0-1.0,
  "issues": ["בעיה ראשונה", "בעיה שנייה"]
}

תאשר את רוב הטענות. דחה רק כשהפגם ברור וחד-משמעי, ובמיוחד אם זיהית בלבול זמני.`,
      },
    ],
  });

  try {
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in verifier response");
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      approved: parsed.approved === true,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      issues: Array.isArray(parsed.issues) ? parsed.issues.slice(0, 3).map(String) : [],
    };
  } catch (err) {
    console.error("Verifier failed to parse response:", err);
    // Fail closed: if the verifier itself errors, don't approve.
    return { approved: false, confidence: 0, issues: ["שגיאה בתהליך האימות"] };
  }
}
