import Parser from "rss-parser";
import { prisma } from "./db";
import { RSS_FEEDS, type FeedSource } from "./rss-feeds";

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
