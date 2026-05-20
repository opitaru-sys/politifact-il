import { prisma } from "./db";
import type { Verdict } from "@/data/mock";

export async function getRecentClaims(days: number = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return prisma.claim.findMany({
    where: {
      date: { gte: cutoff },
      status: "published",
    },
    include: {
      politician: true,
      _count: { select: { comments: true } },
    },
    orderBy: { date: "desc" },
  });
}

export async function getAllPoliticians(windowDays?: number) {
  const where: { status: string; date?: { gte: Date } } = { status: "published" };
  if (windowDays !== undefined) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - windowDays);
    where.date = { gte: cutoff };
  }
  return prisma.politician.findMany({
    include: {
      claims: { where },
    },
  });
}

export async function getPoliticianById(id: string) {
  return prisma.politician.findUnique({
    where: { id },
    include: {
      claims: {
        where: { status: "published" },
        orderBy: { date: "desc" },
        include: { _count: { select: { comments: true } } },
      },
    },
  });
}

export interface PoliticianStatsRow {
  politician: {
    id: string;
    name: string;
    party: string;
    role: string | null;
    image: string | null;
  };
  totalClaims: number;
  trueClaims: number;
  halfTrueClaims: number;
  falseClaims: number;
  truthPercentage: number;
}

export async function getPoliticianStats(windowDays?: number): Promise<PoliticianStatsRow[]> {
  const politicians = await getAllPoliticians(windowDays);

  return politicians
    .map((p) => {
      const claims = p.claims;
      const trueClaims = claims.filter((c) => c.verdict === "true").length;
      const halfTrueClaims = claims.filter((c) => c.verdict === "half-true").length;
      const falseClaims = claims.filter((c) => c.verdict === "false").length;
      const total = claims.length;
      const truthPercentage =
        total > 0
          ? Math.round(((trueClaims + halfTrueClaims * 0.5) / total) * 100)
          : 0;

      return {
        politician: {
          id: p.id,
          name: p.name,
          party: p.party,
          role: p.role,
          image: p.image,
        },
        totalClaims: total,
        trueClaims,
        halfTrueClaims,
        falseClaims,
        truthPercentage,
      };
    })
    .filter((s) => s.totalClaims > 0)
    .sort((a, b) => a.truthPercentage - b.truthPercentage);
}

export async function getPartyStats(windowDays?: number) {
  const politicians = await getAllPoliticians(windowDays);

  const partyMap: Record<
    string,
    { trueClaims: number; halfTrue: number; falseClaims: number; total: number }
  > = {};

  for (const p of politicians) {
    for (const claim of p.claims) {
      if (!partyMap[p.party]) {
        partyMap[p.party] = { trueClaims: 0, halfTrue: 0, falseClaims: 0, total: 0 };
      }
      partyMap[p.party].total++;
      if (claim.verdict === "true") partyMap[p.party].trueClaims++;
      if (claim.verdict === "half-true") partyMap[p.party].halfTrue++;
      if (claim.verdict === "false") partyMap[p.party].falseClaims++;
    }
  }

  return Object.entries(partyMap)
    .map(([party, stats]) => ({
      party,
      ...stats,
      truthPercentage: Math.round(
        ((stats.trueClaims + stats.halfTrue * 0.5) / stats.total) * 100
      ),
    }))
    .sort((a, b) => a.truthPercentage - b.truthPercentage);
}

export async function hasAnyPublishedClaims(): Promise<boolean> {
  const count = await prisma.claim.count({ where: { status: "published" } });
  return count > 0;
}

/** Politicians who exist in the DB but have NO claims in the window. */
export async function getUnrankedPoliticians(windowDays?: number) {
  const cutoff = new Date();
  if (windowDays !== undefined) cutoff.setDate(cutoff.getDate() - windowDays);

  const claimWhere: { status: string; date?: { gte: Date } } = { status: "published" };
  if (windowDays !== undefined) claimWhere.date = { gte: cutoff };

  return prisma.politician.findMany({
    where: { claims: { none: claimWhere } },
    orderBy: { name: "asc" },
    take: 100,
  });
}

/**
 * Most recent activity timestamp — used to render "last updated" on the site.
 * Returns the newest of: claim createdAt, article fetchedAt.
 */
export async function getLastUpdate(): Promise<Date | null> {
  // Fail gracefully if the DB is unreachable — the layout calls this on
  // every render including static prerenders at build time, and we don't
  // want a Neon cold-start to break the entire build.
  try {
    const [latestClaim, latestArticle] = await Promise.all([
      prisma.claim.findFirst({
        where: { status: "published" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.article.findFirst({
        orderBy: { fetchedAt: "desc" },
        select: { fetchedAt: true },
      }),
    ]);
    const dates: Date[] = [];
    if (latestClaim?.createdAt) dates.push(latestClaim.createdAt);
    if (latestArticle?.fetchedAt) dates.push(latestArticle.fetchedAt);
    if (dates.length === 0) return null;
    return new Date(Math.max(...dates.map((d) => d.getTime())));
  } catch (err) {
    console.error("getLastUpdate: DB unreachable, returning null", err);
    return null;
  }
}
