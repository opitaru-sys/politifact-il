import Anthropic from "@anthropic-ai/sdk";
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

function getAnthropic() {
  const apiKey = getEnvVar("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not found in env or .env.local");
  return new Anthropic({ apiKey });
}

/**
 * Prepended to every Anthropic call so the model knows what year/month it is
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
  const response = await getAnthropic().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `${dateContextPreamble()}אתה בודק עובדות לאתר פוליטי. תפקידך לחלץ טענות עובדתיות שאמרו פוליטיקאים, ניתנות לאימות עצמאי.

✅ קריטריונים לחילוץ:
1. **חייב להופיע ציטוט בגרשיים או "אמר", "טען", "הצהיר", "ציטט" בכתבה** — לא ניתוח של כתב על מה שהפוליטיקאי "התכוון". אם בכתבה לא מופיע ציטוט ישיר או פרפרזה מפורשת ("הוא אמר ש..."), אל תחלץ.
2. **התוכן עובדתי ובר-אימות**: מספרים, סטטיסטיקות, החלטות מדיניות, פעולות ממשלתיות, נתונים היסטוריים, הישגים נטענים, אשמות קונקרטיות.
3. **נושא ציבורי**: מדיניות, כלכלה, ביטחון, חברה, משפט, התנחלויות, חינוך, בריאות, או פעולת ממשלה.

✅ גם אם הטענה מנוסחת ברטוריקה פוליטית, אם יש בה ליבה עובדתית בת-אימות — חלץ אותה. למשל: "הם הורסים את המשק עם המסים הגבוהים בעולם" → חלץ את החלק העובדתי: "המסים בישראל הם הגבוהים בעולם".

❌ אל תחלץ:
- הספדים, ביטויי צער, ברכות, הוקרות, ציטוטי דברי תורה/שירה
- אמירות אישיות-ביוגרפיות
- הבטחות עתיד טהורות ("נקים ועדה", "נטפל בזה") — אבל "אתמול הקמתי ועדה" כן בסדר
- דעות לא-עובדתיות בלבד ("זו טעות חמורה") ללא ליבת עובדה
- רטוריקה ללא ליבת עובדה ("אנחנו ננצח")
- שמועות, האשמות עיתונאיות, או דברים שמיוחסים לפוליטיקאי ללא ציטוט

דוגמאות:
✅ ציטוט בכתבה: "האבטלה ירדה ל-2.1%, אמר נתניהו" → חלץ
✅ ציטוט: "סמוטריץ' טען בכנסת: 'הגירעון יישמר ב-3.9%'" → חלץ
❌ "מקורות בליכוד אומרים שנתניהו מתכוון לעלות מסים" → אל תחלץ, זו שמועה
❌ פרשנות עיתונאית: "ראש הממשלה למעשה מודה בכישלון" → אל תחלץ, זו פרשנות
❌ "מעוז ז\"ל היה מפקד נערץ" → הספד

זהה את שם הפוליטיקאי (שם מלא בעברית), סווג את הנושא, ואם אין טענות העונות לקריטריונים — החזר [].

כותרת: ${articleTitle}
תוכן: ${articleContent}
מקור: ${articleSource}

החזר JSON בפורמט הבא בלבד, בלי טקסט נוסף:
[{"politicianName": "שם הפוליטיקאי", "quote": "הציטוט עצמו או פרפרזה צמודה", "topic": "נושא"}]`,
      },
    ],
  });

  try {
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    return JSON.parse(jsonMatch[0]);
  } catch {
    console.error("Failed to parse claims extraction response");
    return [];
  }
}

export async function factCheckClaim(claim: ExtractedClaim): Promise<FactCheckResult> {
  const response = await getAnthropic().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    // Anthropic's hosted web_search tool. The model decides when to call it,
    // Anthropic runs the search server-side, results stream back in
    // `web_search_tool_result` content blocks before the final text block.
    // Cost: ~$0.01 per search added to the base ~$0.025/claim. Cap at 3
    // searches per claim → worst case ~$0.055/claim total (~$1.65/day at
    // 30 claims). Israeli user_location nudges results toward Hebrew sources.
    tools: [
      {
        type: "web_search_20260209",
        name: "web_search",
        max_uses: 3,
        user_location: {
          type: "approximate",
          country: "IL",
          timezone: "Asia/Jerusalem",
        },
      },
    ],
    messages: [
      {
        role: "user",
        content: `${dateContextPreamble()}אתה בודק עובדות מקצועי לפוליטיקה ישראלית. בדוק את הטענה הבאה:

פוליטיקאי: ${claim.politicianName}
טענה: "${claim.quote}"
נושא: ${claim.topic}

**יש לך גישה לכלי web_search. השתמש בו לפני שאתה מחליט אם הטענה מתייחסת לאירוע אקטואלי, לנתון עדכני (מדדים, סטטיסטיקה, החלטות ממשלה אחרונות), או לכל דבר שעלול להיות מחוץ לידע שלך.** עד 3 חיפושים מותרים. עדיף חיפושים ממוקדים בעברית ("משט עזה ${new Date().getFullYear()}", "מדד המחירים ${new Date().toLocaleDateString("he-IL", { month: "long", year: "numeric" })}") על פני חיפוש כללי באנגלית. מקורות מומלצים: Ynet, הארץ, מעריב, ישראל היום, גלובס, כלכליסט, גוורנמנט.אילי, למ"ס, בנק ישראל, מבקר המדינה.

לאחר החיפוש, החזר את הפסק דין:
- "true" = הטענה נכונה או נכונה ברובה
- "half-true" = הטענה מכילה אמת חלקית, מטעה, או חסרה הקשר חשוב
- "false" = הטענה שגויה או שקרית

החזר 3 שדות טקסט:
1. **summary**: משפט אחד תמציתי (עד 25 מילים) שמסכם למה הפסק דין הזה. זה ה-TL;DR שיוצג ראשון לגולש.
2. **explanation**: הסבר מלא בעברית ברורה ותמציתית. ציין את העובדות העיקריות, מה תומך ומה סותר את הטענה, ואת ההקשר הנדרש. אם השתמשת ב-web_search, ציין מה מצאת.
3. **factSource**: שם המקור (אתר/גוף) שעליו התבססת. אם מצאת מקור ב-web_search, ציין את שמו.
4. **factSourceUrl**: אם מצאת URL ספציפי ב-web_search שמאמת את הטענה, החזר אותו. אחרת null.

חשוב:
- התבסס על נתונים רשמיים (הלמ"ס, בנק ישראל, דו"חות מבקר המדינה, פרוטוקולי כנסת) כאשר זמין.
- אם web_search לא החזיר תוצאות שימושיות וגם הידע הפנימי שלך לא מספיק, סמן confidence נמוך (0.2 או פחות) ופסק "half-true".
- אל תכתוב את ה-summary כמילה הראשונה של ה-explanation. הם נפרדים: ה-summary הוא רזה ומסכם, ה-explanation מפרט.

**אזהרה: אירועים אחרונים.** אם הטענה מתייחסת לאירוע שאתה לא מזהה בוודאות (משט, חיסול, רעידת אדמה, פיגוע, מבצע צבאי, ועדה, ביקור מדיני וכו'), **חפש קודם ב-web_search**. אם החיפוש לא מאשר את האירוע:
- אל תייחס את הטענה לאירוע דומה מהעבר ("המשט ב-2010", "מבצע צוק איתן", "ועדת חקירה ב-2024"). מאוד סביר שמדובר באירוע חדש.
- explanation: ציין במפורש שלא נמצא מידע מאמת ושנדרשת בדיקה ידנית. verdict = "half-true", confidence = 0.2 או פחות.
- אל תמציא פרטים על אירועים שאתה לא בטוח בהם.

החזר JSON בפורמט הבא בלבד, כבלוק טקסט אחרון אחרי כל קריאות ה-web_search:
{"verdict": "true/half-true/false", "summary": "משפט אחד מסכם", "explanation": "הסבר מלא בעברית", "factSource": "שם המקור הרשמי", "factSourceUrl": "כתובת המקור או null", "confidence": 0.0-1.0}`,
      },
    ],
  });

  try {
    // Response may contain interleaved server_tool_use, web_search_tool_result,
    // and text blocks. We want the LAST text block — that's the model's final
    // answer after it's done searching.
    const textBlocks = response.content.filter(
      (b): b is Extract<typeof b, { type: "text" }> => b.type === "text",
    );
    const text = textBlocks.length ? textBlocks[textBlocks.length - 1].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      verdict: parsed.verdict,
      summary: parsed.summary || parsed.explanation?.split(/[.!?]/)[0] || "",
      explanation: parsed.explanation,
      factSource: parsed.factSource ?? null,
      factSourceUrl: parsed.factSourceUrl ?? null,
      confidence: parsed.confidence ?? 0.5,
    };
  } catch {
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
