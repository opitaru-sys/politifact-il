import Parser from "rss-parser";
import { prisma } from "./db";
import { RSS_FEEDS, POLITICIAN_NAMES, type FeedSource } from "./rss-feeds";

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "Badak-FactChecker/1.0",
  },
});

function containsPoliticianMention(text: string): boolean {
  return POLITICIAN_NAMES.some((name) => text.includes(name));
}

export async function fetchFeed(feed: FeedSource) {
  try {
    const result = await parser.parseURL(feed.url);
    const articles = [];

    for (const item of result.items) {
      const title = item.title || "";
      const content = item.contentSnippet || item.content || "";
      const combined = `${title} ${content}`;

      if (!containsPoliticianMention(combined)) continue;

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
  const results = [];
  for (const feed of RSS_FEEDS) {
    const result = await fetchFeed(feed);
    results.push(result);
    console.log(`${feed.name}: ${result.fetched} new articles`);
  }
  return results;
}
