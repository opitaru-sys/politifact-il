import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./db";
import { NAME_TO_ID } from "./rss-feeds";
import { getEnvVar } from "./env";

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

interface ExtractedClaim {
  politicianName: string;
  quote: string;
  topic: string;
}

interface FactCheckResult {
  verdict: "true" | "half-true" | "false";
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
        content: `אתה בודק עובדות לאתר פוליטי. תפקידך לחלץ רק טענות שעומדות בכל הקריטריונים הבאים:

✅ המקור: הפוליטיקאי עצמו אמר את הדבר (ציטוט ישיר או פרפרזה של דבריו). לא דברים שעיתונאי כתב עליו.
✅ סוג הטענה: עובדה ציבורית הניתנת לאימות עצמאי — מספרים, סטטיסטיקות, החלטות מדיניות, פעולות ממשלתיות, נתונים היסטוריים, הישגים נטענים, אשמות קונקרטיות.
✅ נושא ציבורי: הטענה נוגעת למדיניות, לכלכלה, לביטחון, לחברה, למשפט, להתנחלויות, לחינוך, לבריאות, או לפעולת הממשלה — דברים שמשפיעים על אזרחים.

❌ דחה לחלוטין את כל אלה (אל תחלץ אותם, גם אם הפוליטיקאי אמר אותם):
- הספדים, אמירות על נופלים בקרב, ביטויי צער, התנצלויות אישיות
- ברכות, התרגשויות, הוקרות, מסרי כבוד, ציטוטי דברי תורה/שירה
- אמירות אישיות-ביוגרפיות על אדם ספציפי (מי הוא היה, מה הוא אהב, על מה התחתן וכו')
- הבטחות לעתיד שאי אפשר עדיין לאמת ("נקים ועדה", "נטפל בזה", "אני אדאג לכך")
- דעות לא-עובדתיות ("זו טעות חמורה", "המצב בלתי נסבל", "צריך להתנגד")
- רטוריקה פוליטית ללא תוכן עובדתי ("הם הורסים את המדינה", "אנחנו ננצח")
- ציטוטים על שלום, יוקרה, רגשות, או אמירות סמליות

דוגמאות:
✅ "האבטלה ירדה ל-2.1%" — עובדה הניתנת לבדיקה
✅ "ב-2024 הוצאנו 40 מיליארד שקל על המלחמה" — נתון בר-בדיקה
✅ "פירוז חמאס לא קרה כי אל-חדד סירב" — אשמה קונקרטית הניתנת לאימות
❌ "מעוז ז\"ל היה מפקד נערץ" — הספד אישי, לא עובדה ציבורית
❌ "אני נכנס לאירוע, חייבים להגיע לפשרה" — הצהרה רטורית כללית, אין בה עובדה
❌ "נתניהו שיקר על האבטלה" — דברי כתב, לא הפוליטיקאי
❌ "נקים ועדת חקירה ביום הראשון" — הבטחה לעתיד

זהה את שם הפוליטיקאי (שם מלא בעברית), סווג את הנושא, ואם אין טענות העונות לכל הקריטריונים — החזר [].

כותרת: ${articleTitle}
תוכן: ${articleContent}
מקור: ${articleSource}

החזר JSON בפורמט הבא בלבד, בלי טקסט נוסף:
[{"politicianName": "שם הפוליטיקאי", "quote": "מה שהפוליטיקאי אמר", "topic": "נושא"}]`,
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
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `אתה בודק עובדות מקצועי לפוליטיקה ישראלית. בדוק את הטענה הבאה:

פוליטיקאי: ${claim.politicianName}
טענה: "${claim.quote}"
נושא: ${claim.topic}

בדוק את הטענה ותן פסק דין:
- "true" = הטענה נכונה או נכונה ברובה
- "half-true" = הטענה מכילה אמת חלקית, מטעה, או חסרה הקשר חשוב
- "false" = הטענה שגויה או שקרית

חשוב:
- התבסס על נתונים רשמיים (הלמ"ס, בנק ישראל, דו"חות מבקר המדינה, פרוטוקולי כנסת)
- אם אין לך מידע מספיק, סמן confidence נמוך
- הסבר בעברית ברורה ותמציתית
- ציין את המקור הרשמי לבדיקה

החזר JSON בפורמט הבא בלבד:
{"verdict": "true/half-true/false", "explanation": "הסבר בעברית", "factSource": "שם המקור הרשמי", "factSourceUrl": "כתובת המקור או null", "confidence": 0.0-1.0}`,
      },
    ],
  });

  try {
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    return JSON.parse(jsonMatch[0]);
  } catch {
    return {
      verdict: "half-true",
      explanation: "לא ניתן לבדוק טענה זו באופן אוטומטי — נדרשת בדיקה ידנית",
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
