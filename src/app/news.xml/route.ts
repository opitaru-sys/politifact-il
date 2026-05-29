import { prisma } from "@/lib/db";
import { cachedRead } from "@/lib/cache";
import { escapeXml, claimFeedTitle } from "@/lib/feed";

/**
 * Google News sitemap. Google News only indexes items published in the
 * last ~48 hours, so this lists just-published fact-checks with the
 * news: extension metadata. Harmless if the site isn't in Google News
 * Publisher Center yet; it lights up once it is. force-dynamic keeps it
 * off the build-time prerender path.
 */
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://bduk.co.il";

const getNewsItems = cachedRead(
  async () => {
    const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const claims = await prisma.claim.findMany({
      where: { status: "published", editorApproved: true, createdAt: { gte: cutoff } },
      select: {
        id: true,
        quote: true,
        verdict: true,
        createdAt: true,
        politician: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });
    return claims.map((c) => ({
      id: c.id,
      title: claimFeedTitle(c.politician.name, c.verdict, c.quote),
      iso: c.createdAt.toISOString(),
    }));
  },
  ["news-items"],
  { revalidate: 300, tags: ["claims"] },
);

export async function GET() {
  let items: Awaited<ReturnType<typeof getNewsItems>> = [];
  try {
    items = await getNewsItems();
  } catch {
    items = [];
  }

  const urls = items
    .map(
      (it) => `  <url>
    <loc>${escapeXml(`${SITE_URL}/claim/${it.id}`)}</loc>
    <news:news>
      <news:publication>
        <news:name>בדוק</news:name>
        <news:language>he</news:language>
      </news:publication>
      <news:publication_date>${it.iso}</news:publication_date>
      <news:title>${escapeXml(it.title)}</news:title>
    </news:news>
  </url>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urls}
</urlset>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
