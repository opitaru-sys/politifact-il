import Parser from "rss-parser";
import { prisma } from "./db";
import { RSS_FEEDS, type FeedSource } from "./rss-feeds";

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "Badak-FactChecker/1.0",
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
