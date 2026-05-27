/**
 * AI recommendation for a user-submitted report.
 *
 * Given a claim + the reporter's reason/details, asks Gemini to suggest
 * one of four actions an admin could take. The admin sees the suggestion
 * inline on /admin/reports with a one-click apply button.
 *
 * Cost: ~$0.001/report. Runs at page load (3-10 reports typical), so
 * total latency ~3-10s extra on the page. Cached implicitly by Next's
 * data cache for the page's TTL.
 */
import { GoogleGenAI, Type } from "@google/genai";
import { getEnvVar } from "./env";
import { currentOfficeholdersBlock } from "./officeholders";

function getGemini() {
  const apiKey = getEnvVar("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not found");
  return new GoogleGenAI({ apiKey });
}

const MODEL = "gemini-2.5-flash";

export type ReportAction =
  /** Hide the claim entirely; verifier was wrong or content is unfit. */
  | "hide"
  /** Keep the claim live but with a different verdict. */
  | "change_verdict"
  /** Keep the claim + verdict, but rewrite the explanation to fix
   *  context / fact errors. */
  | "edit_explanation"
  /** The report is invalid — the claim is correct as-is. */
  | "dismiss";

export interface ReportRecommendation {
  action: ReportAction;
  /** For `change_verdict`: the new verdict. */
  newVerdict?: "true" | "half-true" | "false";
  /** For `edit_explanation`: the rewritten explanation (in Hebrew). */
  newExplanation?: string;
  /** Shown on /corrections + on the claim itself. Mandatory for hide /
   *  change_verdict / edit_explanation; optional explanation for dismiss. */
  correctionNote: string;
  /** Editor-facing rationale: why this action. NOT shown publicly. */
  reasoning: string;
  /** AI's own confidence 0-1. Below ~0.6, the admin should look harder
   *  before applying. */
  confidence: number;
}

export interface ReportContext {
  /** Reason category the reporter selected (e.g. "פסק הדין שגוי"). */
  reason: string;
  /** Free-text details from the reporter. May be empty. */
  details: string | null;
  claim: {
    quote: string;
    verdict: "true" | "half-true" | "false";
    summary: string | null;
    explanation: string;
    politicianName: string;
    politicianParty: string;
    topic: string;
    /** When the quote was said — load-bearing for retroactive-judgment
     *  decisions (see verifier criterion #13). */
    claimDate: Date | null;
  };
}

export async function recommendForReport(
  ctx: ReportContext,
): Promise<ReportRecommendation> {
  const today = new Date().toISOString().split("T")[0];
  const claimDate = ctx.claim.claimDate
    ? ctx.claim.claimDate.toISOString().split("T")[0]
    : "לא ידוע";

  const prompt = `**הקשר זמני:** היום ${today}. תאריך הציטוט: ${claimDate}.

${currentOfficeholdersBlock()}
אתה עורך בכיר באתר בדיקת עובדות פוליטי. משתמש דיווח על טענה שלדעתו יש בה שגיאה. תפקידך: לקרוא את הטענה, את הבדיקה הקיימת, ואת הדיווח — ולהמליץ על פעולה ספציפית שאתה הייתי מבצע אם היית עורך התורן.

**הטענה הנוכחית:**
פוליטיקאי: ${ctx.claim.politicianName} (${ctx.claim.politicianParty})
נושא: ${ctx.claim.topic}
ציטוט: "${ctx.claim.quote}"
פסק נוכחי: ${ctx.claim.verdict}
${ctx.claim.summary ? `סיכום: ${ctx.claim.summary}\n` : ""}הסבר נוכחי: ${ctx.claim.explanation}

**הדיווח של המשתמש:**
סיבה: ${ctx.reason}
${ctx.details ? `פירוט: ${ctx.details}` : "(לא צורף פירוט)"}

**ארבע אפשרויות פעולה:**

1. **hide** — הסתר את הטענה לחלוטין. בחר אם:
   - הבדיקה שגויה ביסודה (פסק נוכחי לא תואם את האמת בעולם).
   - תוכן הציטוט פסול (אפיון לא מאומת, retroactive, דיווח עיתונאי שאינו אמירה אישית).
   - המדווח צודק ואין דרך לתקן בלי לכתוב מחדש מאפס.

2. **change_verdict** — שנה את הפסק (אמת / חצי-אמת / שקר) בלי לשנות את הציטוט. בחר אם:
   - הציטוט תקין והבדיקה תקפה ברובה, אבל הפסק שנקבע שגוי. דוגמה: ניתן "אמת" אבל למעשה זה "חצי-אמת" כי הפרט המרכזי חסר.
   - חייב לקבוע: \`newVerdict\` = הפסק המתוקן.
   - חייב לכתוב \`correctionNote\` שמסביר לקורא מה השתנה ולמה.

3. **edit_explanation** — שמור על הציטוט והפסק, אבל שכתב את ההסבר. בחר אם:
   - הציטוט והפסק נכונים, אבל ההסבר מכיל טעות עובדתית / חסר הקשר חיוני / מבלבל בין מושגים (כמו "society" מול "company").
   - חייב לכתוב \`newExplanation\` — נוסח עברי מלא, מקצועי, עיתונאי, מבוסס על מקור הציטוט והדיווח. ללא מקפים ארוכים. ללא ציטוטים מומצאים.
   - חייב לכתוב \`correctionNote\` קצר שמסביר את התיקון.

4. **dismiss** — סגור את הדיווח בלי שינוי. בחר אם:
   - הדיווח לא מצביע על פגם אמיתי (אי-הסכמה פוליטית עם הפסק, סלידה מהפוליטיקאי, וכו').
   - הבדיקה הנוכחית עומדת בסטנדרטים: ציטוט מדויק, פסק מבוסס, הסבר תקין.
   - \`correctionNote\`: רשום פה את הנימוק לעורך התורן הבא ("לא נמצא פגם — הפסק תואם את העובדות"). לא יוצג לציבור (אבל יישמר ביומן).

**כללים:**
- \`reasoning\` (עברית, 2-4 משפטים): הסבר לעצמך ולעורך הבא למה בחרת את הפעולה הזו. ציין מה ספציפית פגום או מה ספציפית תקין.
- \`confidence\` (0.0-1.0): הביטחון שלך בהמלצה. אם אתה לא בטוח (דיווח דו-משמעי, חוסר ראיות, צריך בדיקה אנושית) — תן ציון נמוך.
- אם הדיווח כללי ("הטענה לא נכונה" בלי פירוט), והבדיקה הקיימת נראית סבירה — בחר **dismiss** עם confidence בינוני.
- אם המדווח מצביע על פגם ספציפי שנראה משכנע — בחר **hide** / **change_verdict** / **edit_explanation** בהתאם.

**חזר JSON בלבד:**`;

  try {
    const response = await getGemini().models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            action: { type: Type.STRING },
            newVerdict: { type: Type.STRING },
            newExplanation: { type: Type.STRING },
            correctionNote: { type: Type.STRING },
            reasoning: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
          },
          required: ["action", "correctionNote", "reasoning", "confidence"],
        },
      },
    });
    const text = response.text ?? "";
    if (!text.trim()) throw new Error("Empty recommendation");
    const parsed = JSON.parse(
      text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, ""),
    ) as {
      action: string;
      newVerdict?: string;
      newExplanation?: string;
      correctionNote: string;
      reasoning: string;
      confidence: number;
    };

    const action: ReportAction =
      parsed.action === "hide" ||
      parsed.action === "change_verdict" ||
      parsed.action === "edit_explanation" ||
      parsed.action === "dismiss"
        ? parsed.action
        : "dismiss";

    const newVerdict =
      action === "change_verdict" &&
      (parsed.newVerdict === "true" ||
        parsed.newVerdict === "half-true" ||
        parsed.newVerdict === "false")
        ? parsed.newVerdict
        : undefined;

    return {
      action,
      newVerdict,
      newExplanation:
        action === "edit_explanation" && parsed.newExplanation
          ? String(parsed.newExplanation).trim()
          : undefined,
      correctionNote: String(parsed.correctionNote || "").trim(),
      reasoning: String(parsed.reasoning || "").trim(),
      confidence:
        typeof parsed.confidence === "number" &&
        parsed.confidence >= 0 &&
        parsed.confidence <= 1
          ? parsed.confidence
          : 0.5,
    };
  } catch (err) {
    // Fail-safe: tell the admin we couldn't get a recommendation, fall
    // back to manual triage. Better than crashing the whole reports page.
    return {
      action: "dismiss",
      correctionNote: "",
      reasoning: `שגיאת AI: ${err instanceof Error ? err.message : String(err)}. בדוק ידנית.`,
      confidence: 0,
    };
  }
}

/** Label for display in the admin UI. */
export function actionLabel(action: ReportAction): string {
  switch (action) {
    case "hide":
      return "הסתר טענה";
    case "change_verdict":
      return "שנה פסק";
    case "edit_explanation":
      return "תקן הסבר";
    case "dismiss":
      return "סגור דיווח (אין פגם)";
  }
}
