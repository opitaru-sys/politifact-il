import Parser from "rss-parser";
import { prisma } from "./db";
import { RSS_FEEDS, type FeedSource } from "./rss-feeds";
import { fetchArticleBody } from "./article-body";
import {
  TELEGRAM_SOURCES,
  type TelegramSource,
  telegramPostUrl,
  telegramSourceLabel,
} from "./telegram-sources";

/**
 * If the RSS snippet is shorter than this, ingest fetches the full
 * article body via URL. Below this length, extraction usually returns
 * zero claims because the AI has only a teaser to work with. Set with
 * room — a snippet at 800 chars is usually 3-4 sentences, plenty for
 * the AI to find a quote if there is one. Going larger wastes more
 * fetch calls on articles that wouldn't benefit.
 */
const RSS_SNIPPET_MIN_CHARS = 800;

/**
 * URLs that match any of these patterns are dropped at ingest time
 * before the Article row is written. They're things that will never
 * produce a political claim about an Israeli politician — sports
 * scores, foreign-language editions, live tickers — so accepting
 * them just wastes a Gemini extraction call (~$0.0015 each) and
 * clutters the queue.
 *
 * The big offender is Ynet's main news feed (StoryRss1/StoryRss2),
 * which mixes Hebrew Ynet, Ynet sports, Ynet English (ynetnews.com),
 * and Ynet Russian (vesty.co.il) into a single feed. Filtering by URL
 * is a lot cleaner than picking apart the RSS by source field.
 *
 * Extend cautiously: each new pattern silently drops content. Better
 * to over-include and let the fact-check pipeline reject than to
 * silently exclude political coverage we care about.
 */
const URL_BLOCKLIST: RegExp[] = [
  /\/sport(\/|$)/i,           // ynet.co.il/sport/* and similar
  /livegame\.ynet\.co\.il/i,  // live game-tickers
  /ynetnews\.com/i,           // Ynet English edition
  /vesty\.co\.il/i,           // Ynet Russian edition
];

function isBlockedUrl(url: string): boolean {
  return URL_BLOCKLIST.some((re) => re.test(url));
}

// Real-browser UA. Several Israeli news sites (Israel Hayom, Calcalist)
// block requests with "Badak-FactChecker/*" or other unfamiliar agents
// with a 403. Sending a Chrome-on-Mac UA matches what they expect from
// feed readers and resolves the blocks. We accept identifying via the
// Referer header in lieu of UA branding.
const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8",
    "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
    Referer: "https://bduk.co.il/",
  },
});

export async function fetchFeed(feed: FeedSource) {
  try {
    const result = await parser.parseURL(feed.url);
    const articles = [];

    for (const item of result.items) {
      const title = item.title || "";
      const content = item.contentSnippet || item.content || "";
      const url = item.link;
      if (!url) continue;
      // Drop sports / foreign-language editions before they even land
      // in the Article table — see URL_BLOCKLIST above for rationale.
      if (isBlockedUrl(url)) continue;

      const existing = await prisma.article.findUnique({ where: { url } });
      if (existing) continue;

      // If the RSS snippet is too short for the AI to find quotes in,
      // fetch the full article body. Most Israeli RSS feeds only
      // include a 100-500 char teaser; without this step ~70% of
      // ingested articles produce zero claims (they "process" but
      // contribute nothing) and the queue stays full forever. The
      // helper returns null on any failure (HTTP error, block, timeout),
      // in which case we fall back to the snippet we already have.
      let finalContent = content;
      if (finalContent.length < RSS_SNIPPET_MIN_CHARS) {
        const body = await fetchArticleBody(url);
        if (body && body.length > finalContent.length) {
          finalContent = body;
        }
      }

      const article = await prisma.article.create({
        data: {
          title,
          url,
          source: feed.name,
          content: finalContent.substring(0, 5000),
          publishedAt: item.pubDate ? new Date(item.pubDate) : null,
          processed: false,
        },
      });

      articles.push(article);
    }

    return { feed: feed.name, fetched: articles.length };
  } catch (error) {
    console.error(`Error fetching ${feed.name}:`, error);
    return { feed: feed.name, fetched: 0, error: String(error) };
  }
}

export async function fetchAllFeeds() {
  // RSS fetching is network-bound and cheap. Run feeds in parallel so a
  // slow/broken source does not delay the daily freshness pass for every
  // other source. Each individual feed still has its own 10s timeout.
  //
  // Telegram channels (TELEGRAM_SOURCES) are fetched alongside RSS — same
  // dispatch, different per-source fetcher. They land in the same Article
  // table with `source = "טלגרם · <name>"`, so the downstream pipeline
  // doesn't have to special-case them; only the *content shape* differs
  // (already-attributed first-person, see fetchTelegramChannel).
  const rss = RSS_FEEDS.map((feed) => fetchFeed(feed));
  const tg = TELEGRAM_SOURCES.map((src) => fetchTelegramChannel(src));
  const results = await Promise.all([...rss, ...tg]);
  for (const result of results) {
    console.log(`${result.feed}: ${result.fetched} new articles`);
  }
  return results;
}

// --- Telegram ----------------------------------------------------------

const TELEGRAM_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Decode the most common HTML entities + named entities Telegram emits.
 * We only need a small set — Telegram messages are plain text wrapped in
 * `<a>` / `<br>` / `<i>` etc., no exotic entity vocabulary.
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

/** Strip HTML tags from a Telegram message body and normalise whitespace.
 *  We keep `<br>` as a newline so multi-paragraph posts stay readable in
 *  the extractor's context. */
function stripTelegramHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Parsed Telegram post returned by parseTelegramHtml. */
interface TelegramPost {
  postId: string;
  publishedAt: Date | null;
  text: string;
}

/**
 * Parse the HTML returned by `https://t.me/s/<channel>` into a list of
 * posts. Telegram's widget classes are stable, so we use a focused regex
 * rather than pulling in a DOM parser dependency just for this.
 *
 * Each post in the HTML looks roughly like:
 *   <div class="tgme_widget_message ..." data-post="<handle>/<id>" ...>
 *     ...
 *     <time class="..." datetime="2026-05-17T18:00:00+00:00">...</time>
 *     ...
 *     <div class="tgme_widget_message_text js-message_text" ...>
 *       message html (may contain <br>, <a>, <i>, etc.)
 *     </div>
 *   </div>
 */
function parseTelegramHtml(html: string, handle: string): TelegramPost[] {
  const posts: TelegramPost[] = [];
  // We anchor on data-post since it's unique per message. The datetime
  // and message text live inside the same message block; capture them
  // by scanning forward from each data-post hit.
  const blockRe = new RegExp(
    `data-post="${handle}/(\\d+)"[\\s\\S]*?datetime="([^"]+)"[\\s\\S]*?<div class="tgme_widget_message_text[^"]*"[^>]*>([\\s\\S]*?)<\\/div>`,
    "gi",
  );
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(html)) !== null) {
    const [, postId, dt, body] = match;
    const text = stripTelegramHtml(body);
    if (!text) continue; // skip media-only posts with no caption
    let publishedAt: Date | null = null;
    const parsed = new Date(dt);
    if (!Number.isNaN(parsed.getTime())) publishedAt = parsed;
    posts.push({ postId, publishedAt, text });
  }
  return posts;
}

/**
 * Fetch recent posts from one Telegram channel and write Article rows.
 * Mirrors fetchFeed() in shape: returns `{ feed, fetched, error? }`.
 *
 * Key difference from RSS: we prepend each post's content with an
 * explicit "פוסט בטלגרם של <name>" attribution preamble. Without that,
 * the extraction prompt would reject channel posts as unattributed
 * narrative (no quote marks, no third-person attribution verb, often
 * no first-person verb either if the post is a bare factual claim).
 */
export async function fetchTelegramChannel(src: TelegramSource) {
  const feedName = telegramSourceLabel(src.politicianName);
  try {
    const res = await fetch(`https://t.me/s/${src.handle}`, {
      headers: { "User-Agent": TELEGRAM_UA },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return { feed: feedName, fetched: 0, error: `HTTP ${res.status}` };
    }
    const html = await res.text();
    const posts = parseTelegramHtml(html, src.handle);

    let written = 0;
    for (const post of posts) {
      const url = telegramPostUrl(src.handle, post.postId);
      const existing = await prisma.article.findUnique({ where: { url } });
      if (existing) continue;

      // Title is the first line of the post (often a header in
      // Telegram-style posts) or "פוסט מ-<date>" as a fallback so
      // the admin / feed UIs have something to display.
      const firstLine = post.text.split(/\n/, 1)[0].trim();
      const title =
        firstLine.length > 0
          ? firstLine.slice(0, 200)
          : `פוסט בטלגרם · ${post.publishedAt?.toISOString().slice(0, 10) ?? "?"}`;

      // Attribution preamble. The extractor reads source + content and
      // applies first-person / attribution heuristics; this preamble
      // makes the speaker explicit so a bare factual post like
      // "האבטלה ירדה ל-3%" is not falsely rejected as unattributed.
      const content =
        `פוסט בטלגרם של ${src.politicianName} (${src.handle}):\n\n` +
        post.text.slice(0, 5000);

      await prisma.article.create({
        data: {
          title,
          url,
          source: feedName,
          content,
          publishedAt: post.publishedAt,
          processed: false,
        },
      });
      written++;
    }

    return { feed: feedName, fetched: written };
  } catch (error) {
    console.error(`Error fetching Telegram ${src.handle}:`, error);
    return { feed: feedName, fetched: 0, error: String(error) };
  }
}
