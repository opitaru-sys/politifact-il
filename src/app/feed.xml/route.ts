import { prisma } from "@/lib/db";
import { cachedRead } from "@/lib/cache";
import { escapeXml, claimFeedTitle, VERDICT_LABEL_HE } from "@/lib/feed";

/**
 * Outbound RSS 2.0 feed of the most recent published fact-checks. Lets
 * feed readers, aggregators, and Google News pull new claims — the site
 * had a ClaimReview schema but no subscribable feed, so nothing could
 * follow it. force-dynamic keeps it off the build-time prerender path
 * (Neon auto-suspends); the explicit Cache-Control caches the response
 * at the edge, and cachedRead caches the underlying DB read.
 */
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://bduk.co.il";

// Cache a JSON-safe projection: dates are pre-formatted to strings INSIDE
// the cached fn, because unstable_cache round-trips through JSON.stringify
// and would otherwise hand back a string where a Date is expected (see
// src/lib/cache.ts).
const getFeedItems = cachedRead(
  async () => {
    const claims = await prisma.claim.findMany({
      where: { status: "published", editorApproved: true },
      select: {
        id: true,
        quote: true,
        verdict: true,
        summary: true,
        topic: true,
        createdAt: true,
        politician: { select: { name: true, party: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return claims.map((c) => ({
      id: c.id,
      title: claimFeedTitle(c.politician.name, c.verdict, c.quote),
      description:
        c.summary ??
        `${c.politician.name} (${c.politician.party}). פסק דין: ${VERDICT_LABEL_HE[c.verdict] ?? c.verdict}.`,
      topic: c.topic ?? "",
      pubDate: c.createdAt.toUTCString(),
    }));
  },
  ["feed-items"],
  { revalidate: 300, tags: ["claims"] },
);

export async function GET() {
  let items: Awaited<ReturnType<typeof getFeedItems>> = [];
  try {
    items = await getFeedItems();
  } catch {
    items = [];
  }

  const itemsXml = items
    .map((it) => {
      const link = `${SITE_URL}/claim/${it.id}`;
      const category = it.topic ? `\n      <category>${escapeXml(it.topic)}</category>` : "";
      return `    <item>
      <title>${escapeXml(it.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${it.pubDate}</pubDate>${category}
      <description>${escapeXml(it.description)}</description>
    </item>`;
    })
    .join("\n");

  const lastBuild = items[0]?.pubDate ?? new Date().toUTCString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>בדוק · בדיקת עובדות לפוליטיקאים</title>
    <link>${SITE_URL}</link>
    <description>בדיקת עובדות בלתי-תלויה לטענות של פוליטיקאים ישראליים. כל טענה חדשה שנבדקה.</description>
    <language>he-il</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
${itemsXml}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
