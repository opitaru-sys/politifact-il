import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://bduk.co.il";

// Don't prerender at build time — the Neon free-tier compute auto-suspends
// after 5 min idle, and the build host's connection times out before
// cold-start completes. Serve sitemap on-demand instead; cache for 1 hour
// so crawlers don't hammer the DB.
export const dynamic = "force-dynamic";
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Static / catalog pages — always present.
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${SITE_URL}/leaderboard`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/parties`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/compare`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];

  // Dynamic: every politician with at least one published claim, every claim.
  // We cap at reasonable limits — Google rejects sitemaps over 50k URLs.
  const [politicians, claims] = await Promise.all([
    prisma.politician.findMany({
      where: { claims: { some: { status: "published" } } },
      select: { id: true, updatedAt: true },
      take: 5000,
    }),
    prisma.claim.findMany({
      where: { status: "published" },
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 40000,
    }),
  ]);

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

  return [...staticEntries, ...politicianEntries, ...claimEntries];
}
