import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { listCanonicalTopics } from "@/lib/topics";
import { digestSlug } from "@/lib/digest-helpers";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://bduk.co.il";

// Don't prerender at build time — the Neon free-tier compute auto-suspends
// after 5 min idle, and the build host's connection times out before
// cold-start completes. Serve sitemap on-demand instead.
export const dynamic = "force-dynamic";

// The DB reads are wrapped in unstable_cache (below) so crawlers hitting
// the sitemap repeatedly don't each trigger a Neon round-trip. force-dynamic
// keeps the route off the build-time prerender path; unstable_cache gives us
// the 1-hour caching the route segment `revalidate` cannot provide while
// force-dynamic is set (force-dynamic overrides it to 0).
const getSitemapRows = unstable_cache(
  async () => {
    // Dynamic: every politician with at least one published claim, every
    // claim, every published digest. Cap at reasonable limits — Google
    // rejects sitemaps over 50k URLs. Filters mirror PUBLIC_CLAIM_FILTER in
    // queries.ts so search engines don't index pages that 404 from the
    // stricter per-page filter.
    const [politicians, claims, digests] = await Promise.all([
      prisma.politician.findMany({
        where: { claims: { some: { status: "published", editorApproved: true } } },
        select: { id: true, updatedAt: true },
        take: 5000,
      }),
      prisma.claim.findMany({
        where: { status: "published", editorApproved: true },
        select: { id: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 40000,
      }),
      prisma.digest.findMany({
        where: { status: "published" },
        select: { weekOf: true, updatedAt: true },
        orderBy: { weekOf: "desc" },
        take: 500,
      }),
    ]);
    return { politicians, claims, digests };
  },
  ["sitemap-rows"],
  { revalidate: 3600, tags: ["claims", "digests"] },
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Static / catalog pages — always present.
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${SITE_URL}/leaderboard`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/topics`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/digest`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/parties`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/compare`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];

  // Topic landing pages — one per canonical topic. Stable URL set.
  const topicEntries: MetadataRoute.Sitemap = listCanonicalTopics().map(({ slug }) => ({
    url: `${SITE_URL}/topic/${slug}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  const { politicians, claims, digests } = await getSitemapRows();

  const politicianEntries: MetadataRoute.Sitemap = politicians.map((p) => ({
    url: `${SITE_URL}/politician/${p.id}`,
    lastModified: p.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const claimEntries: MetadataRoute.Sitemap = claims.map((c) => ({
    url: `${SITE_URL}/claim/${c.id}`,
    lastModified: c.updatedAt,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const digestEntries: MetadataRoute.Sitemap = digests.map((d) => ({
    url: `${SITE_URL}/digest/${digestSlug(d.weekOf)}`,
    lastModified: d.updatedAt,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [
    ...staticEntries,
    ...topicEntries,
    ...politicianEntries,
    ...claimEntries,
    ...digestEntries,
  ];
}
