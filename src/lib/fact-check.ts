import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./db";
import { NAME_TO_ID } from "./rss-feeds";

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

const anthropic = new Anthropic();

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
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `אתה מנתח כתבות חדשותיות ישראליות ומחלץ טענות של פוליטיקאים שניתן לבדוק.

כללים:
- חלץ טענות עובדתיות שנאמרו על ידי פוליטיקאים ישראליים או שמיוחסות להם
- כולל: ציטוטים ישירים, פרפרזות, טענות שפוליטיקאי ידוע בהן, או עובדות שפוליטיקאי ציין
- כולל: טענות על נתונים, סטטיסטיקות, תוצאות, מדיניות, אירועים היסטוריים
- לא כולל: דעות טהורות, הבטחות עתידיות בלבד, או ספקולציות
- זהה את שם הפוליטיקאי (שם מלא בעברית)
- סווג את הנושא (כלכלה, ביטחון, חינוך, בריאות, חברה, ביטחון פנים, התנחלויות, דת ומדינה, חוץ, משפט, וכד')
- אם אין טענות רלוונטיות, החזר מערך ריק []

כותרת: ${articleTitle}
תוכן: ${articleContent}
מקור: ${articleSource}

החזר JSON בפורמט הבא בלבד, בלי טקסט נוסף:
[{"politicianName": "שם הפוליטיקאי", "quote": "הטענה כפי שנאמרה או יוחסה", "topic": "נושא"}]`,
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
  const response = await anthropic.messages.create({
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
        status: factCheck.confidence >= 0.5 ? "published" : "review",
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
