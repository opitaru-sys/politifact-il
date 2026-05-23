import { prisma } from "./db";

/**
 * Filter applied to every public-facing claim query.
 *
 * `status: "published"` ensures we never show drafts or rejected claims.
 * `editorApproved: true` ensures the second-pass AI verifier has approved
 *   the claim. Without this, the public site shows raw extraction output
 *   including misclassified rhetoric ("this is true because he said it")
 *   — see https://github.com/opitaru-sys/politifact-il commit history.
 *
 * Claims with `editorApproved === null` (never verified) and `false`
 * (rejected by verifier) are both excluded.
 *
 * Admin queries (in admin/status/page.tsx) bypass this filter so we can
 * still see the full pipeline state.
 */
const PUBLIC_CLAIM_FILTER = {
  status: "published",
  editorApproved: true,
} as const;

export async function getRecentClaims(days: number = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return prisma.claim.findMany({
    where: {
      ...PUBLIC_CLAIM_FILTER,
      date: { gte: cutoff },
    },
    include: {
      politician: true,
      _count: { select: { comments: true } },
    },
    orderBy: { date: "desc" },
  });
}

export async function getAllPoliticians(windowDays?: number) {
  const where: { status: string; editorApproved: boolean; date?: { gte: Date } } = {
    ...PUBLIC_CLAIM_FILTER,
  };
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
        where: PUBLIC_CLAIM_FILTER,
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
    // Sort ascending by credibility. Ties stay unordered here — the
    // display layer (leaderboard / hero) applies the correct tiebreaker
    // for *its* end of the spectrum:
    //   Top-of-table / "most credible" → more claims wins (more
    //     reliable signal of being credible).
    //   "Last place" hero card → more claims also wins (more reliable
    //     signal of being at the bottom).
    // Since these are at opposite ends of the array, no single
    // secondary sort can satisfy both — see LiarOfTheWeek and the
    // leaderboard pages where the proper tiebreaker is applied.
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
  const count = await prisma.claim.count({ where: PUBLIC_CLAIM_FILTER });
  return count > 0;
}

/** Politicians who exist in the DB but have NO claims in the window. */
export async function getUnrankedPoliticians(windowDays?: number) {
  const cutoff = new Date();
  if (windowDays !== undefined) cutoff.setDate(cutoff.getDate() - windowDays);

  const claimWhere: { status: string; editorApproved: boolean; date?: { gte: Date } } = {
    ...PUBLIC_CLAIM_FILTER,
  };
  if (windowDays !== undefined) claimWhere.date = { gte: cutoff };

  return prisma.politician.findMany({
    where: { claims: { none: claimWhere } },
    orderBy: { name: "asc" },
    take: 100,
  });
}

/**
 * Earliest claim we have on record. Used to render "data since DATE"
 * so visitors understand the temporal coverage. Excludes rejected
 * claims so the date reflects the publicly-visible dataset.
 *
 * Cached softly via the request memoization in queries (recomputed
 * per request, but the underlying ORDER BY date ASC LIMIT 1 is fast).
 */
export async function getDataCollectionStart(): Promise<Date | null> {
  try {
    const first = await prisma.claim.findFirst({
      where: PUBLIC_CLAIM_FILTER,
      orderBy: { date: "asc" },
      select: { date: true },
    });
    return first?.date ?? null;
  } catch (err) {
    console.error("getDataCollectionStart: DB unreachable", err);
    return null;
  }
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
        where: PUBLIC_CLAIM_FILTER,
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
