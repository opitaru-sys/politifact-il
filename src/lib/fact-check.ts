import { GoogleGenAI, Type } from "@google/genai";
import { jsonrepair } from "jsonrepair";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { NAME_TO_ID, RSS_FEEDS } from "./rss-feeds";
import { TELEGRAM_SOURCE_NAMES } from "./telegram-sources";
import { getEnvVar } from "./env";
import { verifyClaim } from "./verify-claim";
import { editorialReview } from "./editorial-review";
import { findClaimQualityIssues } from "./claim-quality";
import { currentOfficeholdersBlock } from "./officeholders";
import { applyDowngrade, DOWNGRADE_TAG } from "./institutional-intent";
import { MODEL_FLASH as MODEL } from "./gemini-models";

/**
 * Normalize a Hebrew quote for fuzzy-matching: strip vowels, punctuation,
 * normalize verb conjugations (basic), collapse whitespace.
 * Used for dedup so "אשב עם מי שיחזק" matches "אשב עם מי שמחזק".
 */
function normalizeHebrew(s: string): string {
  return s
    .replace(/[֑-ׇ]/g, "")        // niqqud / cantillation marks
    .replace(/[^א-ת\s]/g, " ")     // keep only Hebrew letters + space
    .replace(/\s+/g, " ")
    .trim();
}

/** Letter-level Jaccard similarity of two normalized strings. */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const wordsA = new Set(a.split(" ").filter((w) => w.length > 2));
  const wordsB = new Set(b.split(" ").filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersect = 0;
  for (const w of wordsA) if (wordsB.has(w)) intersect++;
  const union = wordsA.size + wordsB.size - intersect;
  return intersect / union;
}

/**
 * True if politician already has a near-identical published claim.
 *
 * Two-stage check:
 *  1. Exact normalized match — short-circuits when the same quote appears
 *     verbatim in two different articles (Knesset transcripts replay the
 *     same talking points across sessions; news outlets quote each other).
 *  2. Word-set Jaccard ≥ 0.55 — catches paraphrases that differ in
 *     punctuation, niqqud, conjugation, or trailing context but share
 *     most content words.
 *
 * Lowered the Jaccard threshold from 0.6 to 0.55 after the May 21
 * cleanup pass found 16 sim=1.0 duplicates that should never have
 * existed. The exact-match short-circuit is the main fix; the threshold
 * tweak is belt-and-suspenders.
 */
async function isDuplicate(politicianId: string, quote: string): Promise<boolean> {
  const existing = await prisma.claim.findMany({
    where: { politicianId, status: "published" },
    select: { quote: true },
    take: 200,
  });
  const target = normalizeHebrew(quote);
  for (const e of existing) {
    const otherNorm = normalizeHebrew(e.quote);
    // Stage 1: exact normalized match.
    if (target === otherNorm) return true;
    // Stage 2: fuzzy similarity.
    if (similarity(target, otherNorm) >= 0.55) return true;
  }
  return false;
}

import { fetchArticleBody } from "./article-body";

function getGemini() {
  const apiKey = getEnvVar("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not found in env or .env.local");
  return new GoogleGenAI({ apiKey });
}

/**
 * Parses a JSON response from Gemini, robust to the common ways LLMs
 * break JSON output:
 *   1. Wrapping in ```json ... ``` fences.
 *   2. Leading/trailing prose around the JSON object.
 *   3. Unescaped quote characters inside string values (Hebrew text
 *      with quoted phrases is a frequent offender).
 *
 * `jsonrepair` handles (3) by attempting to repair malformed JSON.
 * If even repair fails, we throw — caller is expected to have a fallback.
 */
function parseJsonLoose<T>(text: string): T {
  let cleaned = text.trim();
  // Strip ```json ... ``` fences if present.
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  // Fall back to the first {...} or [...] span if there's still leading prose.
  if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
    const m = cleaned.match(/[\[{][\s\S]*[\]}]/);
    if (m) cleaned = m[0];
  }
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Try repairing — handles unescaped quotes, trailing commas, etc.
    return JSON.parse(jsonrepair(cleaned)) as T;
  }
}

/**
 * Prepended to every Gemini call so the model knows what year/month it is
 * and explicitly handles its own training-data cutoff. Without this, the
 * model silently substitutes older similar events (e.g. it'll fact-check a
 * 2026 Gaza flotilla quote against the 2010 Mavi Marmara incident).
 */
function dateContextPreamble(claimDate?: Date | null): string {
  const today = new Date();
  const iso = today.toISOString().split("T")[0];
  const hebrew = today.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });
  // If we know when the quote was said, include that — critical for
  // relative time expressions ("we are now", "this week", "last month").
  // Without it the model judged "we are now end of March" against today's
  // date and called it false, even when the quote was from a March
  // Knesset session.
  const claimDateBlock = claimDate
    ? `\nתאריך הציטוט: ${claimDate.toISOString().split("T")[0]} (${claimDate.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}).\nכשיש בציטוט ביטוי זמן יחסי ("עכשיו", "השבוע", "החודש", "השנה", "אתמול", "השנים האחרונות"), פרש אותו ביחס לתאריך הציטוט, לא ביחס להיום. דוגמה: ציטוט מ-20 במרץ שאומר "אנחנו עכשיו בסוף מרץ" — נכון, לא שקר.`
    : "";
  return `**הקשר זמני קריטי לפני הבדיקה:**
היום: ${iso} (${hebrew}).${claimDateBlock}
מודל ה-AI שלך מאומן על מידע שעלול לא לכלול אירועים אחרונים. אם הטענה מתייחסת לאירוע שאתה לא מזהה בוודאות מתוך הידע שלך, אל תנחש ואל תייחס אותה לאירוע דומה מהעבר. במקום זה הצהר שאינך יכול לאמת אותה ובחר verdict "half-true" עם confidence נמוך, או החזר בקשה לבדיקה ידנית. עדיף "לא יודע" מאשר תשובה בטוחה לגבי אירוע לא נכון.

${currentOfficeholdersBlock()}`;
}

interface ExtractedClaim {
  politicianName: string;
  quote: string;
  topic: string;
}

interface FactCheckResult {
  verdict: "true" | "half-true" | "false";
  summary: string;
  explanation: string;
  factSource: string | null;
  factSourceUrl: string | null;
  confidence: number;
}

export async function extractClaims(
  articleTitle: string,
  articleContent: string,
  articleSource: string,
): Promise<ExtractedClaim[]> {
  const prompt = `${dateContextPreamble()}אתה בודק עובדות לאתר פוליטי. תפקידך לחלץ **רק** טענות שניתנות לאימות עובדתי מול מקור חיצוני. אסור לחלץ דעות, רטוריקה, סלוגנים, או האשמות כלליות.

**🚫 כלל ראשון (מקדים לכל הקריטריונים): הטענה חייבת להיות משהו שהפוליטיקאי *אמר* (במילים שלו), לא משהו שהכתבה מדווחת שהוא *עשה* או שקרה בעקבותיו.**

סימנים שהציטוט באמת אמירה של הפוליטיקאי (צריך לפחות אחד):
- הטקסט בתוך מרכאות בכתבה המקורית
- פועל ייחוס מפנה לפיו ("X אמר/טען/הצהיר/מסר/הודיע/הוסיף/ציטט")
- צורת גוף ראשון: "אני", "אנחנו", "הוצאנו", "החלטתי", "חתמתי", "התפטרתי"

❌ **דחה גם אם זה נשמע כמו טענה — זה דיווח, לא ציטוט:**
- "חתם על צו לפינוי..." → פועל בגוף שלישי מתאר פעולה. דיווח עיתונאי. אסור.
- "בעקבות הסרטונים של X, נוצר גל גינויים..." → תוצאה של פעולת הפוליטיקאי בלשון נסתר. דיווח. אסור.
- "סרטון המשט שהפיק X" → תיאור פריט תקשורתי. לא ציטוט.
- "X פגש את ראש הממשלה" → דיווח על פעולה.
- "אישר תכנית..." / "הזכיר ש..." / "הכריז ש..." (ללא מרכאות וללא לשון ישירה) → נסתר.
- אם שם הפוליטיקאי מופיע *בתוך* הציטוט בגוף שלישי ("בעקבות הסרטונים של בן גביר...") — זו לא הוא מדבר, זה עיתונאי מדבר עליו. אסור.

✅ **כן לחלץ:**
- "נתניהו: 'הוצאנו 50 מיליארד'" (ייחוס + לשון ראשון)
- "סמוטריץ' אמר היום שיחתום על צו..." (פועל ייחוס)
- "'חתמתי על הצו', מסר השר" (לשון ראשון + פועל ייחוס)

**🚫 כלל שני: עלבונות, האשמות פיגורטיביות, ולשון פסיכולוגית-מבזה — אסור לחלץ, גם אם נאמרו במפורש בציטוט מובהק.**

סוגי אמירות שאסור לחלץ אפילו בלשון ישירה ובמרכאות:
- "ח"כ X מחתן כלבים בבתי הכנסת ההזויים שלו" — דימוי + עלבון. אין מה לאמת.
- "X פסיכי / מטורף / חצוף / צבוע / בוגד" — תיוג רגשי. לא ניתן לאמת.
- "בית הכנסת שלו הזוי" — שיפוט סובייקטיבי.
- "התנהגות מבזה / מטומטמת / ילדותית" — שיפוט מוסרי-רגשי.
- כל מתקפה אישית על פוליטיקאי אחר ללא נתון/אירוע/פעולה ספציפיים → דחה.
- מילים-דגלים שאמורות להפעיל דחייה אוטומטית: "ההזוי", "ההזויה", "ההזויים", "פסיכי", "פסיכים", "מטורף", "מטורפת", "מטורפים", "בוגד", "בוגדים", "בגידה", "צבוע", "צבועים", "מטומטם", "טיפש", "חצוף", "חצופים".

---

**הקריטריון העיקרי לחילוץ (לאחר ששני הכללים העל-קריטיים אושרו):** בדוק את עצמך - האם הציטוט מכיל לפחות אחד מאלה?
- **מספר/סטטיסטיקה/אחוז ספציפי**: "האבטלה 3.2%", "30 חטופים", "הוצאנו 50 מיליארד"
- **אירוע ספציפי עם תאריך/מקום**: "ב-2023 הקמתי ועדה", "בפגישה אתמול עם ביידן"
- **פעולה קונקרטית של ממשלה/הפוליטיקאי**: "חתמתי על החוק X", "התפטרתי", "הצבעתי נגד"
- **השוואה ניתנת לאימות**: "מסים גבוהים יותר מאוסטריה", "הצמיחה הגבוהה ב-OECD"
- **עובדה היסטורית/מדעית/משפטית ספציפית**: "חוק X נחקק ב-2015", "פסיקת בג"ץ"

אם אין באף אחד מאלה - **אסור לחלץ**.

**מבחן השאלה היחיד:** האם אתה יכול לדמיין שאתה מחפש בגוגל/למ"ס/מבקר המדינה ומקבל תשובה "כן/לא/חלקי" על הציטוט? אם לא - זו לא טענה עובדתית, זו דעה או רטוריקה. אל תחלץ.

❌ **אסור לחלץ** (אפילו אם זה ציטוט ישיר ומפורש):
- אמירות עמדה/דעה טהורות: "זה רע", "צריך להבין", "זה חשוב", "מקווה ש..."
- האשמות עמומות בלי תוכן ניתן לבדיקה: "הם משקרים תמיד", "הם בוגדים", "הם רעים" — "תמיד"/"הם"/"רעים" עמום מדי לבדיקה
- סלוגנים/קריאות מערכה: "עם ישראל חי", "נגמרה הקייטנה", "אנחנו ננצח", "לא נשבר"
- מטאפורות ודימויים: "נגמרה הקייטנה", "הסכר נפרץ"
- שיפוט מוסרי/רגשי טהור: "בזוי", "מבייש", "מצער"
- בקשות, תקוות, איחולים: "אני מקווה ש...", "צריך ש..."
- הבטחות עתיד טהורות: "נקים ועדה", "נטפל בזה" (אבל "אתמול הקמתי ועדה" כן בסדר)

✅ **חשוב: כן לחלץ — האשמות גורפות וטענות אופי על קבוצה/מוסד שמכילות טענה עובדתית מובלעת.**
   הקריטריון: האם הטענה מנוסחת באופן שמאפשר לשאול שאלת בדיקה ספציפית? אם כן — חלץ, גם אם זה נשמע "רטורי":
   - "כל ערביי ישראל תומכים בטרור" ✓ → שאלת בדיקה: "האם 100% מערביי ישראל תומכים בטרור?" → אפשר לבדוק נגד סקרים. הוורייפייר ימצא נתונים סקריים והפסק יהיה כנראה "שקר" או "חצי-אמת".
   - "השופטים בבג"ץ נטויים שמאלה" ✓ → שאלת בדיקה: "האם רוב פסיקות בג"ץ נוטות לעמדות שמאל?" → אפשר לבדוק נגד דפוסי פסיקה.
   - "החרדים לא משלמים מסים" ✓ → שאלת בדיקה: "האם רוב/כל החרדים אינם משלמים מס?" → נתוני רשות המסים נגישים.
   - "המהגרים מביאים פשע" ✓ → שאלת בדיקה: "האם שיעור הפשיעה גבוה משמעותית בקרב מהגרים?" → נתוני משטרה.
   - "הם תומכי טרור" ✓ (כשהקשר ברור) → שאלת בדיקה: "האם החברים בקבוצה X תמכו פומבית בטרור?" → ניתן לבדוק.
   הבחנה קריטית: הציטוטים האלה נראים "רטורים" אבל יש בהם טענה ניתנת לבדיקה. **חלץ אותם** — הוורייפייר יסווג בהתאם לראיות.

❌ **אבל לא לחלץ עלבונות אישיים נגד אדם ספציפי**: "בן גביר פסיכי", "לפיד מטומטם" — אלה תיוגים רגשיים על אדם, לא טענה גורפת על קבוצה עם בסיס לבדיקה.
- **הספדים, אזכרות, ופרסומי נפילה בקרב — דחה אוטומטית, ללא יוצא מן הכלל**: כל ציטוט שמכיל "ז״ל", "הי״ד", "נפל בקרב", "הותיר אחריו", "הלוויה", "לזכרו", "תהא נשמתו", "יהי זכרו", "השתתפים בצער", "תנחומי", או פרטים ביוגרפיים על חייל שנפל (שם, גיל, מקום מגורים, גדוד/חטיבה, תפקיד) — זו לא טענה ציבורית, זה הספד. גם אם זה נכון עובדתית ("הסמל X אכן נפל בקרב Y") — לא נכון לעלות זאת לאתר בדיקת עובדות פוליטי. דחה.
- ברכות, איחולים, חגים: "שבת שלום", "חג שמח", "מועדים לשמחה", "מזל טוב", "בריאות איתנה" — דחה
- ציטוטי תורה/שירה/תהילים, תוכן דתי-אישי: "תורתו מגן", "בעזרת השם", "התפללתי לעילוי נשמת", "אדוננו בר יוחאי" — דחה
- שמועות, פרשנות עיתונאית ("ראש הממשלה למעשה מודה ש...")
- **תוכן פרוצדורלי של הכנסת** — אסור לחלץ כל תוכן הליכי / מנהלי / טכני של פרוטוקול:
  - רשימות נוכחות/נעדרים: "X אינו נוכח", "Y - אינה נוכחת", "נוכחים: ...", "נעדרים: ..."
  - תוצאות הצבעה / מספר הצבעה: "ההצבעה התקבלה", "ההצבעה מספר 142", "X מצביע בעד"
  - פתיחה/סגירה של ישיבה: "הישיבה ננעלה", "הדיון נדחה", "הוועדה הסתיימה"
  - דברי טקס: "תודה אדוני היו"ר", "בבקשה", "אנא רשמו לפרוטוקול"
  - דברי ביניים פרוצדורליים — אלה אינם טענות עובדתיות גם אם מופיע בהם שם חבר כנסת.

✅ **דוגמאות לחילוץ נכון:**
- "האבטלה ירדה ל-2.1%, אמר נתניהו" ✓
- "סמוטריץ': 'הגירעון יישמר ב-3.9%'" ✓
- "בן גביר: 'חתמתי על צו להעביר 800 לוחמים לאשדוד'" ✓ (פעולה ספציפית)
- "ביבי: 'הוצאנו ב-2025 מיליארד שקל על הביטחון'" ✓
- "בן גביר: 'כל ערביי ישראל תומכים בטרור'" ✓ (טענה גורפת עם בסיס לבדיקה — הוורייפייר יבדוק נגד נתונים סקריים)
- "סמוטריץ': 'החרדים לא משלמים מסים'" ✓ (ניתן לבדיקה נגד רשות המסים)
- "לוין: 'בית המשפט הוא חונטה שמאלנית'" ✓ (ניתן לבדיקה נגד פסיקות בג"ץ)

❌ **דוגמאות לדחייה:**
- "בן גביר: 'נגמרה הקייטנה. עם ישראל חי'" ❌ (סלוגן + מטאפורה. אין מה לאמת)
- "נתניהו: 'אני מקווה שראש הממשלה ישאיר אתכם כמה שיותר זמן בכלא'" ❌ (תקווה/הבטחה. לא ניתן לאמת)
- "סמוטריץ': 'הם משקרים בלי בושה'" ❌ (עמום: "הם" + "תמיד" — אין שאלת בדיקה ספציפית)
- "לפיד: 'בן גביר פסיכי'" ❌ (עלבון אישי על אדם ספציפי — לא טענה גורפת על קבוצה)

**עקרון מרכזי:** הסטנדרט הוא "האם זה ניתן לאימות?" לא "האם זה ציטוט אמיתי?" כל ציטוט ניתן לאימות שהוא צוטט נכון - זה לא העניין. השאלה היא **האם המידע בתוך הציטוט נכון בעולם האמיתי**. אם אין מידע - אל תחלץ.

זהה את שם הפוליטיקאי (שם מלא בעברית), סווג את הנושא, ואם אין טענות העונות לקריטריונים — החזר [].

כותרת: ${articleTitle}
תוכן: ${articleContent}
מקור: ${articleSource}

החזר מערך JSON של טענות. אם אין טענות העונות לקריטריונים — החזר מערך ריק [].`;

  try {
    const response = await getGemini().models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        // No grounding needed: we already have the article content; the
        // model just classifies what's there. Saves grounded-request quota
        // for the fact-check step where it actually matters.
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              politicianName: { type: Type.STRING },
              quote: { type: Type.STRING },
              topic: { type: Type.STRING },
            },
            required: ["politicianName", "quote", "topic"],
          },
        },
      },
    });
    const text = response.text ?? "";
    return parseJsonLoose<ExtractedClaim[]>(text);
  } catch (err) {
    console.error("Failed to parse claims extraction response:", err);
    return [];
  }
}

export async function factCheckClaim(
  claim: ExtractedClaim,
  options?: { claimDate?: Date | null },
): Promise<FactCheckResult> {
  // Gemini 2.5 Flash + Google Search grounding. The model autonomously
  // decides whether to invoke Google Search before answering. Grounding
  // is free up to 500 requests/day on the Gemini API. Replaces the
  // Anthropic Sonnet + web_search combo, which cost ~$0.20/claim once
  // search-result tokens were factored in.
  //
  // Pricing target: ~$0.02/claim including grounded search.
  const prompt = `${dateContextPreamble(options?.claimDate)}אתה בודק עובדות מקצועי לפוליטיקה ישראלית. בדוק את הטענה הבאה:

פוליטיקאי: ${claim.politicianName}
טענה: "${claim.quote}"
נושא: ${claim.topic}

**⚠️ קריטי - מה אתה בודק:** אתה בודק את **התוכן העובדתי** של הטענה - האם הנתון, האירוע, הפעולה, או ההשוואה שמופיעים בציטוט נכונים בעולם האמיתי. אתה **לא** בודק אם הפוליטיקאי באמת אמר את המילים האלה (זה כבר ידוע - מישהו אחר חילץ את הציטוט מכתבה אמינה).

**אסור לתת verdict "true" רק כי הציטוט מצוטט נכון.** אם הציטוט הוא דעה, סלוגן, האשמה כללית בלי נתון, רטוריקה, או מטאפורה - אין בו תוכן עובדתי לאמת, ואסור להגיד "true". במקרה הזה, החזר:
- verdict = "half-true"
- confidence = 0.0
- summary = "הציטוט אינו מכיל טענה עובדתית ניתנת לאימות (דעה/רטוריקה/סלוגן)."
- explanation = הסבר קצר למה אין מה לבדוק כאן.

(הציטוט הזה לא היה אמור להגיע אליך לבדיקה - תקלה בשלב החילוץ. אבל אם הוא הגיע, סמן אותו כך כדי שהמערכת תוכל לסנן אותו.)

**אם יש בציטוט תוכן עובדתי לבדוק** (מספר, אירוע ספציפי, פעולה, השוואה):

**יש לך גישה ל-Google Search. השתמש בו לפני שאתה מחליט אם הטענה מתייחסת לאירוע אקטואלי, לנתון עדכני (מדדים, סטטיסטיקה, החלטות ממשלה אחרונות), או לכל דבר שעלול להיות מחוץ לידע שלך.** עדיף חיפושים ממוקדים בעברית ("משט עזה ${new Date().getFullYear()}", "מדד המחירים ${new Date().toLocaleDateString("he-IL", { month: "long", year: "numeric" })}"). מקורות אמינים: Ynet, הארץ, מעריב, ישראל היום, גלובס, כלכליסט, gov.il, למ"ס, בנק ישראל, מבקר המדינה, כנסת.

לאחר החיפוש, החזר את הפסק דין. **חשוב מאוד - כיול הפסקים:**

**"אמת"** = הליבה העובדתית של הטענה נכונה. הציבור שיקרא את הטענה יקבל תמונה נכונה. סטיות מספריות קטנות (פחות מ-5%) אינן מורידות לחצי אמת. עיגולים סבירים הם בסדר.
   דוגמאות:
   - "76,000 נפגעים" כאשר הנתון הרשמי הוא 75,995 → **אמת** (סטייה של 0.007%, עיגול לגיטימי)
   - "כמעט 200,000 חיילים" כאשר הנתון 197,500 → **אמת**
   - "האבטלה ירדה ל-3%" כאשר הנתון 3.2% → **אמת** (עיגול סביר)
   - "החוק עבר ב-2018" כאשר עבר ב-2018 → **אמת**

**"חצי אמת"** = הטענה מטעה את הציבור באופן מהותי. שמור פסק זה למקרים של הטעיה אמיתית:
   - הקשר חסר ומשמעותי: "האבטלה 2.7%" - נכון, אבל מסתיר ששיעור התעסוקה תקוע מתחת ל-61% מאז המלחמה
   - חלק נכון, חלק לא: "הקמנו ועדה ופתרנו את הבעיה" - הקמתם ועדה (נכון) אבל לא פתרתם (שגוי)
   - סטייה מספרית משמעותית (10-30%): "100,000 נפגעים" כאשר הנתון 75,000
   - פרשנות מטעה של נתון נכון: "הצמיחה מהגבוהות במערב" כשהיא ממוצעת
   **אסור להוריד לחצי אמת רק כי הנתון אינו מעודכן לחודש האחרון.** אם הנתון נכון לתקופה שבה הטענה נאמרה - אמת.

**הצהרת כוונה מוסדית = חצי-אמת:** אם הציטוט הוא פוליטיקאי המצהיר שמוסד שבראשו הוא עומד יבצע פעולה ספציפית נגד אדם או ארגון מזוהה (חרם, סירוב קשר, מניעה, ניתוק תקציב), פסק הדין חייב להיות "חצי-אמת" גם אם הציטוט אכן נאמר. הסיבה: בדיקה זו יכולה לאמת שההצהרה נאמרה בפומבי, אבל אינה יכולה לאמת שהמוסד אכן יבצע את הפעולה או שיש לו סמכות חוקית לעשות זאת. ההסבר חייב להתייחס לשני הצדדים: (1) האם ההצהרה אכן נאמרה (כן/לא, מקור), ו-(2) הפעולה המוצהרת לא אומתה — לא בוצעה / סמכות חוקית בלתי ברורה / טרם דווח על יישום.
דוגמאות:
- "מערכת הביטחון לא תקיים עם X כל קשר" — חצי-אמת אם נאמר.
- "המשרד יפסיק לממן עמותת Y" — חצי-אמת אם נאמר.
- "אני מורה לצבא לא לעבוד עם Z" — חצי-אמת אם נאמר.
דלג על הכלל הזה אם: הציטוט מתאר כוונה אישית ("אני לא אפגש"), פעולה כללית ("ישראל לא תנהל"), או פעולה חיובית/פרוצדורלית ("המשרד יפעל לקדם").

**"שקר"** = הטענה שגויה במהותה:
   - הנתון רחוק מהמציאות (סטייה של 30%+): "200,000 חיילים" כשיש 75,000
   - האירוע לא קרה
   - הפעולה לא בוצעה
   - היפוך עובדתי

**עקרון מנחה:** שאל את עצמך - "אם הציבור יקרא רק את הציטוט הזה ויקבל אותו כעובדה, האם תמונת המציאות שלו תהיה נכונה?" אם כן → אמת. אם תהיה מעוותת באופן מהותי → חצי אמת. אם תהיה הפוכה → שקר.

החזר את כל השדות:
1. **verdict**: "true" / "half-true" / "false"
2. **summary**: משפט אחד תמציתי (עד 25 מילים) שמסכם למה הפסק דין הזה. זה ה-TL;DR שיוצג ראשון לגולש.
3. **explanation**: הסבר מלא בעברית ברורה ותמציתית. ציין את העובדות העיקריות, מה תומך ומה סותר את הטענה, ואת ההקשר הנדרש. אם השתמשת בחיפוש, ציין מה מצאת.
4. **factSource**: שם המקור (אתר/גוף) שעליו התבססת. אם מצאת מקור בחיפוש, ציין את שמו.
5. **factSourceUrl**: אם מצאת URL ספציפי שמאמת את הטענה, החזר אותו. אחרת השאר ריק.
6. **confidence**: 0.0-1.0 — כמה אתה בטוח בפסק.

חשוב:
- התבסס על נתונים רשמיים (הלמ"ס, בנק ישראל, דו"חות מבקר המדינה, פרוטוקולי כנסת) כאשר זמין.
- אם החיפוש לא החזיר תוצאות שימושיות וגם הידע הפנימי שלך לא מספיק, סמן confidence נמוך (0.2 או פחות) ופסק "half-true".
- אל תכתוב את ה-summary כמילה הראשונה של ה-explanation. הם נפרדים: ה-summary הוא רזה ומסכם, ה-explanation מפרט.

**אזהרה: אירועים אחרונים.** אם הטענה מתייחסת לאירוע שאתה לא מזהה בוודאות (משט, חיסול, רעידת אדמה, פיגוע, מבצע צבאי, ועדה, ביקור מדיני וכו'), **חפש קודם**. אם החיפוש לא מאשר את האירוע:
- אל תייחס את הטענה לאירוע דומה מהעבר ("המשט ב-2010", "מבצע צוק איתן", "ועדת חקירה ב-2024"). מאוד סביר שמדובר באירוע חדש.
- explanation: ציין במפורש שלא נמצא מידע מאמת ושנדרשת בדיקה ידנית. verdict = "half-true", confidence = 0.2 או פחות.
- אל תמציא פרטים על אירועים שאתה לא בטוח בהם.

**החזר אך ורק JSON בפורמט הבא, בלי טקסט נוסף לפניו או אחריו:**
{"verdict": "true|half-true|false", "summary": "...", "explanation": "...", "factSource": "...", "factSourceUrl": "...", "confidence": 0.0}`;

  // Backfill switch: set BADAK_DISABLE_GROUNDING=1 to skip the
  // googleSearch tool. Grounding adds ~20-25s per fact-check (live
  // search round-trip + grounded-output streaming) and is the dominant
  // cost when processing thousands of historical articles. Disabling
  // it speeds the drain ~6-8x. Trade-off: the model has to rely on
  // training-data knowledge for current events — many recent-event
  // claims will get half-true / low confidence as a result, then the
  // verifier rejects them, and they stay hidden from the public site
  // (which only shows editorApproved=true). High-quality historical
  // claims still get through.
  const useGrounding = process.env.BADAK_DISABLE_GROUNDING !== "1";

  try {
    const response = await getGemini().models.generateContent({
      model: MODEL,
      contents: prompt,
      config: useGrounding
        ? {
            // Gemini gotcha: `googleSearch` tool and `responseMimeType:
            // "application/json"` are mutually exclusive — the API
            // returns INVALID_ARGUMENT if both are set. We choose
            // grounding here and ask for JSON in the prompt + parse it
            // loosely.
            tools: [{ googleSearch: {} }],
          }
        : {
            // No grounding → we can use the strict JSON schema.
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                verdict: { type: Type.STRING, enum: ["true", "half-true", "false"] },
                summary: { type: Type.STRING },
                explanation: { type: Type.STRING },
                factSource: { type: Type.STRING },
                factSourceUrl: { type: Type.STRING },
                confidence: { type: Type.NUMBER },
              },
              required: ["verdict", "summary", "explanation"],
            },
          },
    });

    const text = response.text ?? "";
    if (!text.trim()) throw new Error("Empty response from Gemini");

    // Always prefer the FIRST URI from grounding metadata over whatever
    // the model wrote into factSourceUrl. The model tends to write a
    // human-readable comma-separated list of all sources, which we
    // can't link to. Grounding chunks give us a single clean URI.
    // (Google's TOS requires using their `vertexaisearch...` redirect
    // URLs anyway — they handle click tracking + citation rendering.)
    let groundingUrl: string | null = null;
    const meta = response.candidates?.[0]?.groundingMetadata;
    if (meta?.groundingChunks?.length) {
      const firstWeb = meta.groundingChunks.find((c) => c.web?.uri);
      if (firstWeb?.web?.uri) groundingUrl = firstWeb.web.uri;
    }

    const p = parseJsonLoose<{
      verdict: "true" | "half-true" | "false";
      summary?: string;
      explanation: string;
      factSource?: string | null;
      factSourceUrl?: string | null;
      confidence?: number;
    }>(text);

    // Defensive coercion: the model sometimes omits required fields
    // (especially the explanation, when its JSON output truncates). We
    // can't persist undefined to a NOT-NULL Postgres column, so coalesce
    // to a non-empty placeholder. The verifier will subsequently reject
    // these (criterion #5: "explanation is entirely vague").
    const explanation = (p.explanation && String(p.explanation).trim()) ||
      "ההסבר חסר. נדרשת בדיקה ידנית.";
    return {
      verdict: p.verdict ?? "half-true",
      summary: (p.summary && String(p.summary).trim()) ||
        explanation.split(/[.!?]/)[0] || "",
      explanation,
      factSource: p.factSource ?? null,
      // Prefer grounding URL over model-written URL — see comment above.
      factSourceUrl: groundingUrl || p.factSourceUrl || null,
      confidence: typeof p.confidence === "number" ? p.confidence : 0.5,
    };
  } catch (err) {
    console.error("Fact-check failed for", claim.quote.slice(0, 50), err instanceof Error ? err.message : err);
    return {
      verdict: "half-true",
      summary: "טענה זו טעונה בדיקה ידנית.",
      explanation: "לא ניתן לבדוק טענה זו באופן אוטומטי. נדרשת בדיקה ידנית.",
      factSource: null,
      factSourceUrl: null,
      confidence: 0,
    };
  }
}

/**
 * Cheap heuristic — does this content have any chance of containing a
 * fact-checkable political quote? Used as a pre-filter so we don't waste
 * an extraction API call on procedural one-liners (Knesset roll-calls,
 * news snippets without attribution).
 *
 * We skip if ALL of:
 *  - body is short (< 250 chars after the inserted "דובר:" preamble)
 *  - no quote characters anywhere
 *  - no Hebrew attribution verbs (אמר, טען, הצהיר, etc.)
 *  - no multi-digit numbers (a 2+ digit number usually signals a
 *    statistic the model could fact-check)
 *
 * False negatives are cheap (we miss a few claims). False positives are
 * expensive (we burn an extraction call for nothing). The threshold is
 * tuned to skip ~30-40% of Knesset transcript blocks while keeping
 * essentially all RSS articles.
 */
function shouldSkipExtraction(content: string): boolean {
  const trimmed = content?.trim() ?? "";
  if (trimmed.length < 250) {
    const hasQuotes = /["״׳"]/.test(trimmed);
    const hasAttribution = /אמר|טען|הצהיר|מסר|הוסיף|ציטט|הביע|הודיע|התריע|התבטא/.test(trimmed);
    const hasNumbers = /\d{2,}/.test(trimmed);
    return !hasQuotes && !hasAttribution && !hasNumbers;
  }
  return false;
}

/**
 * For Knesset transcript articles, the speaker is locked-in by the
 * title format `${speaker} (מליאת הכנסת)`. If that speaker isn't in
 * NAME_TO_ID, extraction would only produce claims attributed to them
 * (since the block contains only their speech), and every one would
 * get dropped at the politician-lookup step. Skip extraction entirely
 * in that case — saves a Gemini call per article.
 *
 * For RSS articles we can't apply this trick because one article can
 * quote multiple politicians.
 */
function knessetSpeakerInMap(article: { title: string; source: string }): boolean | null {
  if (article.source !== "כנסת · מליאה") return null; // not a knesset article
  // Title is like "בנימין נתניהו (מליאת הכנסת)" — strip the suffix and look up.
  const speaker = article.title.replace(/\s*\(מליאת הכנסת\)\s*$/, "").trim();
  // Try exact and then partial matches against NAME_TO_ID keys.
  if (NAME_TO_ID[speaker]) return true;
  // Some Knesset speaker labels include their role prefix (e.g.
  // "השר אלי כהן"). Strip common prefixes and retry.
  const stripped = speaker
    .replace(/^(השר|השרה|שר|שרת|חבר הכנסת|חברת הכנסת|ח"כ|יו"ר|סגן|סגנית|המקשר.*?לכנסת|ראש הממשלה|רוה"מ)\s+/, "")
    .trim();
  if (NAME_TO_ID[stripped]) return true;
  // Last-name-only match — many entries in NAME_TO_ID include the bare
  // surname as a key (e.g. "ביבי" → netanyahu).
  const lastName = stripped.split(/\s+/).pop() ?? "";
  if (lastName && NAME_TO_ID[lastName]) return true;
  return false;
}

export async function processArticle(articleId: string) {
  const article = await prisma.article.findUnique({ where: { id: articleId } });
  if (!article || article.processed) return [];

  // Quick speaker check for Knesset articles — bail before extraction
  // if we already know no claim from this speaker can map to a known
  // politician.
  const speakerCheck = knessetSpeakerInMap(article);
  if (speakerCheck === false) {
    await prisma.article.update({
      where: { id: articleId },
      data: { processed: true, extractedData: "[]" },
    });
    return [];
  }

  let content = article.content || "";
  // Lazy fallback: if the article snuck through ingest with a short
  // snippet (e.g. older row from before the ingest-time body-fetch
  // landed), grab the body now and persist it so reprocessing
  // wouldn't pay the cost again. Threshold matches the ingest-time
  // RSS_SNIPPET_MIN_CHARS so behavior is consistent.
  if (content.length < 800) {
    const fullContent = await fetchArticleBody(article.url);
    if (fullContent && fullContent.length > content.length) {
      content = fullContent;
      await prisma.article.update({
        where: { id: articleId },
        data: { content },
      });
    }
  }

  // Pre-filter: skip extraction on articles that almost certainly have no
  // fact-checkable quotes. Saves ~30-40% of extraction calls on the
  // Knesset transcript corpus where many blocks are short procedural lines.
  if (shouldSkipExtraction(content)) {
    await prisma.article.update({
      where: { id: articleId },
      data: { processed: true, extractedData: "[]" },
    });
    return [];
  }

  const claims = await extractClaims(article.title, content, article.source);

  // Up-front filtering: drop claims with unknown politicians or politicians
  // not in the DB before we start any Gemini calls. Done serially because
  // it's just DB lookups (~1ms each).
  const eligible: { claim: ExtractedClaim; politicianId: string; politicianName: string }[] = [];
  for (const claim of claims) {
    const politicianId = NAME_TO_ID[claim.politicianName];
    if (!politicianId) continue;
    const politician = await prisma.politician.findUnique({
      where: { id: politicianId },
      select: { id: true, name: true },
    });
    if (!politician) continue;
    const qualityIssues = findClaimQualityIssues({
      quote: claim.quote,
      politicianName: politician.name,
      source: article.source,
    });
    if (qualityIssues.length > 0) {
      console.log(
        `Skipping extracted claim for ${politician.name}: ${qualityIssues.map((i) => i.reason).join("; ")}`,
      );
      continue;
    }
    if (await isDuplicate(politicianId, claim.quote)) continue;
    eligible.push({ claim, politicianId, politicianName: politician.name });
  }

  // Fact-check + verify each eligible claim concurrently. Each claim's
  // pipeline is independent (different quote, different DB row) so we
  // can fan out. Limits the total Gemini concurrency by gating on the
  // outer article-level chunk (see ARTICLE_CONCURRENCY).
  const results = await Promise.all(
    eligible.map(async ({ claim, politicianId, politicianName }) => {
      // Pass the article's publishedAt so the model interprets relative
      // time expressions ("we are now", "this week") against when the
      // quote was actually said, not against today.
      const factCheck = await factCheckClaim(claim, { claimDate: article.publishedAt });

      // Race-condition guard: isDuplicate() ran ~10s ago (before the
      // grounded fact-check call). If another article processing the
      // same quote won the race in the meantime, we'd now insert a
      // duplicate row with a possibly-different verdict (model isn't
      // deterministic across runs). Re-check immediately before insert
      // and skip if a near-dup appeared. Shrinks the race window from
      // ~10 seconds to a few ms.
      if (await isDuplicate(politicianId, claim.quote)) {
        console.log(
          `Race-skip: ${politicianName} quote was inserted by a concurrent article during fact-check; dropping this copy.`,
        );
        return null;
      }

      const saved = await prisma.claim.create({
        data: {
          politicianId,
          quote: claim.quote,
          verdict: factCheck.verdict,
          summary: factCheck.summary,
          explanation: factCheck.explanation,
          source: article.source,
          sourceUrl: article.url,
          factSource: factCheck.factSource,
          factSourceUrl: factCheck.factSourceUrl,
          topic: claim.topic,
          date: article.publishedAt || new Date(),
          status: "published",
          confidence: factCheck.confidence,
        },
      });
      try {
        const verification = await verifyClaim({
          quote: saved.quote,
          verdict: saved.verdict as "true" | "half-true" | "false",
          summary: saved.summary,
          explanation: saved.explanation,
          source: saved.source,
          factSource: saved.factSource,
          politicianName,
          topic: saved.topic,
          claimDate: article.publishedAt,
        });

        // Institutional-intent downgrade: if the verifier emitted the
        // [downgrade-to-half-true] tag in issues, rewrite the verdict
        // and explanation in-place rather than rejecting. The claim
        // stays live (editorApproved=true) but the verdict reflects
        // that we only verified the declaration, not the outcome.
        // See src/lib/institutional-intent.ts.
        let postVerdict = saved.verdict;
        let postExplanation = saved.explanation;
        const downgradeRequested = verification.issues.some((i) =>
          i.includes(DOWNGRADE_TAG),
        );
        if (downgradeRequested && saved.verdict === "true") {
          const downgrade = applyDowngrade({
            verdict: saved.verdict,
            explanation: saved.explanation,
            notes: verification.issues,
          });
          postVerdict = downgrade.verdict;
          postExplanation = downgrade.explanation;
          // Override: treat verifier as approving (we're keeping the claim,
          // just at a more conservative verdict).
          verification.approved = true;
        }

        // Third pass: editorial newsworthiness review. Only runs if the
        // technical verifier approved — there's no point asking the editor
        // about a claim we're already going to reject. If the editor
        // rejects, we override approval and prepend "[עורך] " to the
        // verifier notes so /corrections shows the editorial reason.
        // Skip via BADAK_DISABLE_EDITOR=1 for cost control during big
        // backfills.
        let finalApproved = verification.approved;
        const notes: string[] = verification.issues.slice();
        if (verification.approved && process.env.BADAK_DISABLE_EDITOR !== "1") {
          try {
            const editorial = await editorialReview({
              quote: saved.quote,
              verdict: saved.verdict as "true" | "half-true" | "false",
              summary: saved.summary,
              explanation: saved.explanation,
              politicianName,
              topic: saved.topic,
              claimDate: article.publishedAt,
            });
            if (!editorial.approved) {
              finalApproved = false;
              notes.unshift(`[עורך] ${editorial.reason}`);
            }
          } catch (err) {
            console.error(`Editorial review failed for claim ${saved.id}:`, err);
            // Fail open — keep verifier's decision.
          }
        }

        await prisma.claim.update({
          where: { id: saved.id },
          data: {
            editorApproved: finalApproved,
            verifiedAt: new Date(),
            verifierNotes: notes.length ? notes.join("; ") : null,
            // Only write verdict + explanation back if the downgrade
            // changed them. Saves a column-write on the happy path.
            ...(postVerdict !== saved.verdict && { verdict: postVerdict }),
            ...(postExplanation !== saved.explanation && { explanation: postExplanation }),
          },
        });
      } catch (err) {
        console.error(`Verification failed for claim ${saved.id}:`, err);
      }
      return saved;
    }),
  );

  await prisma.article.update({
    where: { id: articleId },
    data: {
      processed: true,
      extractedData: JSON.stringify(claims),
    },
  });

  // Filter out null entries from race-skips (see the dedup guard above).
  return results.filter((r): r is NonNullable<typeof r> => r !== null);
}

/**
 * How many articles to process concurrently. Gemini Flash allows 1500
 * req/min on the paid tier and the free tier still allows ~60 req/min.
 *
 * Default 8: with claim-level parallelism inside each article and
 * grounding disabled (BADAK_DISABLE_GROUNDING=1), per-call latency
 * drops to ~3s. 8 articles × ~3 claims = ~24 concurrent Gemini calls
 * at peak, well under 60 RPM.
 *
 * If you re-enable grounding for the cron path, drop this to 4 — each
 * grounded call takes ~25s and the daily 500-grounded-request quota
 * fills fast at higher concurrency.
 *
 * If you bump this, also watch the Prisma connection pool (default is
 * num_cpus*2+1) — each in-flight processArticle holds 2-4 connections.
 */
const ARTICLE_CONCURRENCY = Number(process.env.BADAK_ARTICLE_CONCURRENCY ?? 8);

const KNESSET_SOURCE = "כנסת · מליאה";
const RSS_SOURCE_NAMES = RSS_FEEDS.map((feed) => feed.name);
// "Fresh public sources" = RSS + Telegram. Both are time-sensitive
// public-facing material we want to surface within the freshness SLA.
// Knesset transcripts are intentionally excluded — they ride the
// backfill lane on a tiny daily budget.
const FRESH_SOURCE_NAMES = [...RSS_SOURCE_NAMES, ...TELEGRAM_SOURCE_NAMES];

type ArticleQueueOrder = "oldest" | "newest";

interface ProcessArticlesOptions {
  limit?: number;
  sources?: string[];
  excludeSources?: string[];
  fetchedSince?: Date;
  publishedSince?: Date;
  order?: ArticleQueueOrder;
}

type NormalizedProcessOptions =
  Required<Pick<ProcessArticlesOptions, "limit" | "order">> &
  Omit<ProcessArticlesOptions, "limit" | "order">;

function normalizeProcessOptions(
  input: number | ProcessArticlesOptions = 50,
): NormalizedProcessOptions {
  if (typeof input === "number") return { limit: input, order: "oldest" };
  return {
    ...input,
    limit: input.limit ?? 50,
    order: input.order ?? "oldest",
  };
}

export async function processUnprocessedArticles(input: number | ProcessArticlesOptions = 50) {
  const options = normalizeProcessOptions(input);
  const where: Prisma.ArticleWhereInput = { processed: false };
  if (options.sources?.length) where.source = { in: options.sources };
  if (options.excludeSources?.length) where.source = { notIn: options.excludeSources };
  if (options.fetchedSince) where.fetchedAt = { gte: options.fetchedSince };
  if (options.publishedSince) where.publishedAt = { gte: options.publishedSince };

  const articles = await prisma.article.findMany({
    where,
    orderBy:
      options.order === "newest"
        ? [{ fetchedAt: "desc" }]
        : [{ fetchedAt: "asc" }],
    take: options.limit,
  });

  console.log(`Processing ${articles.length} unprocessed articles (concurrency=${ARTICLE_CONCURRENCY})...`);

  const allResults = [];
  for (let i = 0; i < articles.length; i += ARTICLE_CONCURRENCY) {
    const chunk = articles.slice(i, i + ARTICLE_CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map((a) => processArticle(a.id)),
    );
    for (let j = 0; j < settled.length; j++) {
      const res = settled[j];
      const a = chunk[j];
      if (res.status === "fulfilled") {
        if (res.value.length > 0) {
          console.log(`${a.title}: extracted ${res.value.length} claims`);
        }
        allResults.push(...res.value);
      } else {
        console.error(`Error processing ${a.title}:`, res.reason instanceof Error ? res.reason.message : res.reason);
      }
    }
  }

  return allResults;
}

/**
 * Priority lane for public freshness. This processes only RSS/news articles
 * fetched recently, newest first, so a huge Knesset transcript backlog can
 * never starve today's news coverage.
 */
export async function processFreshNewsArticles(limit: number = 80, hours: number = 48) {
  const fetchedSince = new Date(Date.now() - hours * 60 * 60 * 1000);
  return processUnprocessedArticles({
    limit,
    // RSS + Telegram together — both are fresh public material.
    sources: FRESH_SOURCE_NAMES,
    fetchedSince,
    order: "newest",
  });
}

/**
 * Low-budget backfill lane. Use a small daily cap so the historical Knesset
 * corpus drains eventually without consuming the daily freshness budget.
 */
export async function processKnessetBacklog(limit: number = 5) {
  return processUnprocessedArticles({
    limit,
    sources: [KNESSET_SOURCE],
    order: "oldest",
  });
}
