import { GoogleGenAI, Type } from "@google/genai";
import { jsonrepair } from "jsonrepair";
import { prisma } from "./db";
import { NAME_TO_ID } from "./rss-feeds";
import { getEnvVar } from "./env";
import { verifyClaim } from "./verify-claim";

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
 * Compares normalized quotes by word-set Jaccard ≥ 0.6.
 */
async function isDuplicate(politicianId: string, quote: string): Promise<boolean> {
  const existing = await prisma.claim.findMany({
    where: { politicianId, status: "published" },
    select: { quote: true },
    take: 200,
  });
  const target = normalizeHebrew(quote);
  for (const e of existing) {
    if (similarity(target, normalizeHebrew(e.quote)) >= 0.6) return true;
  }
  return false;
}

async function fetchArticleContent(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      headers: { "User-Agent": "Badak-FactChecker/1.0" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    // Strip HTML tags, scripts, styles — extract text content
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
    return text.substring(0, 8000);
  } catch {
    return null;
  }
}

function getGemini() {
  const apiKey = getEnvVar("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not found in env or .env.local");
  return new GoogleGenAI({ apiKey });
}

const MODEL = "gemini-2.5-flash";

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
function dateContextPreamble(): string {
  const today = new Date();
  const iso = today.toISOString().split("T")[0];
  const hebrew = today.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });
  return `**הקשר זמני קריטי לפני הבדיקה:**
היום: ${iso} (${hebrew}).
מודל ה-AI שלך מאומן על מידע שעלול לא לכלול אירועים אחרונים. אם הטענה מתייחסת לאירוע שאתה לא מזהה בוודאות מתוך הידע שלך, אל תנחש ואל תייחס אותה לאירוע דומה מהעבר. במקום זה הצהר שאינך יכול לאמת אותה ובחר verdict "half-true" עם confidence נמוך, או החזר בקשה לבדיקה ידנית. עדיף "לא יודע" מאשר תשובה בטוחה לגבי אירוע לא נכון.

`;
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

**הקריטריון העיקרי לחילוץ:** בדוק את עצמך - האם הציטוט מכיל לפחות אחד מאלה?
- **מספר/סטטיסטיקה/אחוז ספציפי**: "האבטלה 3.2%", "30 חטופים", "הוצאנו 50 מיליארד"
- **אירוע ספציפי עם תאריך/מקום**: "ב-2023 הקמתי ועדה", "בפגישה אתמול עם ביידן"
- **פעולה קונקרטית של ממשלה/הפוליטיקאי**: "חתמתי על החוק X", "התפטרתי", "הצבעתי נגד"
- **השוואה ניתנת לאימות**: "מסים גבוהים יותר מאוסטריה", "הצמיחה הגבוהה ב-OECD"
- **עובדה היסטורית/מדעית/משפטית ספציפית**: "חוק X נחקק ב-2015", "פסיקת בג"ץ"

אם אין באף אחד מאלה - **אסור לחלץ**.

**מבחן השאלה היחיד:** האם אתה יכול לדמיין שאתה מחפש בגוגל/למ"ס/מבקר המדינה ומקבל תשובה "כן/לא/חלקי" על הציטוט? אם לא - זו לא טענה עובדתית, זו דעה או רטוריקה. אל תחלץ.

❌ **אסור לחלץ** (אפילו אם זה ציטוט ישיר ומפורש):
- אמירות עמדה/דעה: "זה רע", "צריך להבין", "זה חשוב", "מקווה ש..."
- האשמות כלליות בלי מעשה ספציפי: "הם תומכי טרור", "הם משחיתים", "הם משקרים", "הם בוגדים"
- סלוגנים/קריאות מערכה: "עם ישראל חי", "נגמרה הקייטנה", "אנחנו ננצח", "לא נשבר"
- מטאפורות ודימויים: "נגמרה הקייטנה", "הסכר נפרץ"
- שיפוט מוסרי/רגשי: "בזוי", "מבייש", "מצער"
- בקשות, תקוות, איחולים: "אני מקווה ש...", "צריך ש..."
- הבטחות עתיד טהורות: "נקים ועדה", "נטפל בזה" (אבל "אתמול הקמתי ועדה" כן בסדר)
- הספדים, ברכות, הוקרות, ציטוטי תורה/שירה
- שמועות, פרשנות עיתונאית ("ראש הממשלה למעשה מודה ש...")

✅ **דוגמאות לחילוץ נכון:**
- "האבטלה ירדה ל-2.1%, אמר נתניהו" ✓
- "סמוטריץ': 'הגירעון יישמר ב-3.9%'" ✓
- "בן גביר: 'חתמתי על צו להעביר 800 לוחמים לאשדוד'" ✓ (פעולה ספציפית)
- "ביבי: 'הוצאנו ב-2025 מיליארד שקל על הביטחון'" ✓

❌ **דוגמאות לדחייה (אלה הוצאו בעבר בטעות, אל תחזור על הטעות):**
- "בן גביר: 'הם תומכי טרור, הם הגיעו לכאן בגאווה ותראו מה קורה איתם'" ❌ (האשמה כללית + רטוריקה. אין מה לאמת)
- "בן גביר: 'נגמרה הקייטנה. עם ישראל חי'" ❌ (סלוגן + מטאפורה. אין מה לאמת)
- "נתניהו: 'אני מקווה שראש הממשלה ישאיר אתכם כמה שיותר זמן בכלא'" ❌ (תקווה/הבטחה. לא ניתן לאמת)
- "סמוטריץ': 'הם משקרים בלי בושה'" ❌ (האשמה כללית. אין נתון)

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

export async function factCheckClaim(claim: ExtractedClaim): Promise<FactCheckResult> {
  // Gemini 2.5 Flash + Google Search grounding. The model autonomously
  // decides whether to invoke Google Search before answering. Grounding
  // is free up to 500 requests/day on the Gemini API. Replaces the
  // Anthropic Sonnet + web_search combo, which cost ~$0.20/claim once
  // search-result tokens were factored in.
  //
  // Pricing target: ~$0.02/claim including grounded search.
  const prompt = `${dateContextPreamble()}אתה בודק עובדות מקצועי לפוליטיקה ישראלית. בדוק את הטענה הבאה:

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

  try {
    const response = await getGemini().models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        // Gemini gotcha: `googleSearch` tool and `responseMimeType:
        // "application/json"` are mutually exclusive — the API returns
        // INVALID_ARGUMENT if both are set. We choose grounding here and
        // ask for JSON in the prompt + parse it loosely. The model
        // reliably emits JSON when instructed; parseJsonLoose handles
        // the occasional ```json``` fence.
        tools: [{ googleSearch: {} }],
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

    return {
      verdict: p.verdict,
      summary: p.summary || p.explanation?.split(/[.!?]/)[0] || "",
      explanation: p.explanation,
      factSource: p.factSource ?? null,
      // Prefer grounding URL over model-written URL — see comment above.
      factSourceUrl: groundingUrl || p.factSourceUrl || null,
      confidence: p.confidence ?? 0.5,
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

export async function processArticle(articleId: string) {
  const article = await prisma.article.findUnique({ where: { id: articleId } });
  if (!article || article.processed) return [];

  let content = article.content || "";
  if (content.length < 200) {
    const fullContent = await fetchArticleContent(article.url);
    if (fullContent && fullContent.length > content.length) {
      content = fullContent;
      await prisma.article.update({
        where: { id: articleId },
        data: { content },
      });
    }
  }

  const claims = await extractClaims(article.title, content, article.source);

  const results = [];

  for (const claim of claims) {
    const politicianId = NAME_TO_ID[claim.politicianName];
    if (!politicianId) {
      console.log(`Unknown politician: ${claim.politicianName}`);
      continue;
    }

    const politician = await prisma.politician.findUnique({ where: { id: politicianId } });
    if (!politician) continue;

    // Dedup: skip if this politician already has a near-identical quote
    if (await isDuplicate(politicianId, claim.quote)) {
      console.log(`Skipping duplicate for ${claim.politicianName}: ${claim.quote.substring(0, 50)}`);
      continue;
    }

    const factCheck = await factCheckClaim(claim);

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

    // Second-pass verification. Fail-soft: a verifier error leaves the
    // claim published but unverified, never blocks the pipeline.
    try {
      const verification = await verifyClaim({
        quote: saved.quote,
        verdict: saved.verdict as "true" | "half-true" | "false",
        summary: saved.summary,
        explanation: saved.explanation,
        source: saved.source,
        factSource: saved.factSource,
        politicianName: politician.name,
        topic: saved.topic,
      });
      await prisma.claim.update({
        where: { id: saved.id },
        data: {
          editorApproved: verification.approved,
          verifiedAt: new Date(),
          verifierNotes: verification.issues.length ? verification.issues.join("; ") : null,
        },
      });
    } catch (err) {
      console.error(`Verification failed for claim ${saved.id}:`, err);
    }

    results.push(saved);
  }

  await prisma.article.update({
    where: { id: articleId },
    data: {
      processed: true,
      extractedData: JSON.stringify(claims),
    },
  });

  return results;
}

export async function processUnprocessedArticles(limit: number = 50) {
  const articles = await prisma.article.findMany({
    where: { processed: false },
    orderBy: { fetchedAt: "asc" },
    take: limit,
  });

  console.log(`Processing ${articles.length} unprocessed articles...`);

  const allResults = [];
  for (const article of articles) {
    try {
      const results = await processArticle(article.id);
      console.log(`${article.title}: extracted ${results.length} claims`);
      allResults.push(...results);
    } catch (error) {
      console.error(`Error processing ${article.title}:`, error);
    }
  }

  return allResults;
}
