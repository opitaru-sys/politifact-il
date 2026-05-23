import Parser from "rss-parser";
import { prisma } from "./db";
import { RSS_FEEDS, type FeedSource } from "./rss-feeds";

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

      const article = await prisma.article.create({
        data: {
          title,
          url,
          source: feed.name,
          content: content.substring(0, 5000),
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
  const results = await Promise.all(RSS_FEEDS.map((feed) => fetchFeed(feed)));
  for (const result of results) {
    console.log(`${result.feed}: ${result.fetched} new articles`);
  }
  return results;
}
