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

export interface RecentClaimsOpts {
  limit?: number;
  offset?: number;
  topic?: string | null;
  politicianId?: string | null;
}

/**
 * Build the WHERE clause shared by `getRecentClaims` and
 * `getRecentClaimsCount`. Filters (topic / politicianId) are pushed
 * into the SQL query so pagination can be done correctly in the DB
 * — previously we fetched everything and filtered with `.filter()`
 * in `page.tsx`, which made limit/offset meaningless.
 */
function buildRecentClaimsWhere(days: number, opts: RecentClaimsOpts = {}) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const where: {
    status: string;
    editorApproved: boolean;
    date: { gte: Date };
    topic?: string;
    politicianId?: string;
  } = {
    ...PUBLIC_CLAIM_FILTER,
    date: { gte: cutoff },
  };
  if (opts.topic) where.topic = opts.topic;
  if (opts.politicianId) where.politicianId = opts.politicianId;
  return where;
}

export async function getRecentClaims(
  days: number = 30,
  opts: RecentClaimsOpts = {},
) {
  return prisma.claim.findMany({
    where: buildRecentClaimsWhere(days, opts),
    include: {
      politician: true,
      _count: { select: { comments: true } },
    },
    orderBy: { date: "desc" },
    ...(opts.limit !== undefined ? { take: opts.limit } : {}),
    ...(opts.offset !== undefined ? { skip: opts.offset } : {}),
  });
}

/**
 * Cheap row count for the header (`{N} טענות`). Separated so the
 * paginated `getRecentClaims` doesn't have to fetch every row just
 * to compute a total — Postgres can count via index without
 * materializing the full result set.
 */
export async function getRecentClaimsCount(
  days: number = 30,
  opts: RecentClaimsOpts = {},
): Promise<number> {
  return prisma.claim.count({ where: buildRecentClaimsWhere(days, opts) });
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

/**
 * Count of claims for this politician that were extracted and saved but
 * then filtered out of the public score — verifier rejection, editor
 * rejection, or post-hoc sweep / triage. Used on the profile page to
 * answer the "how can this awful politician be at the top?" question
 * with a concrete number: "X statements not counted because they weren't
 * fact-checkable / were rhetorical / were ceremonial / etc."
 *
 * Counts ONLY claims that made it into the Claim table. Extraction-time
 * regex rejections (eulogies, news-narrative quotes, etc.) never enter
 * the DB and are NOT in this count. The number is therefore a floor on
 * the real "filtered" total, not the ceiling — which is fine, the goal
 * is concrete evidence, not exhaustive accounting.
 *
 * Status filter intentionally includes both "published" (then un-approved
 * later) and "draft" (verifier rejected before publication), because the
 * user-facing question is "did this statement count?" — for both, the
 * answer is no.
 */
export async function getFilteredClaimCount(politicianId: string): Promise<number> {
  return prisma.claim.count({
    where: {
      politicianId,
      editorApproved: false,
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
  /** Headline number: weighted truth rate = (true + 0.5*half) / total, ×100. */
  truthPercentage: number;
  /**
   * Wilson score interval LOWER BOUND at 95% confidence — used for ranking.
   *
   * Why we don't sort by truthPercentage directly:
   *   3 claims at 100% (raw 100%) ranks above 50 claims at 80% (raw 80%),
   *   even though the second politician has a far more reliable record.
   *   Wilson penalizes small samples — the 3-claim politician's lower
   *   bound is ~38% (huge uncertainty) while the 50-claim politician's
   *   is ~73% (tight estimate).
   *
   * Result: small-sample politicians need a few more correct calls before
   * they outrank a long-track-record politician. The displayed % still
   * shows the raw rate (familiar, expected), but the ORDER on the
   * leaderboard reflects credibility-with-confidence.
   *
   * Stored as a 0-100 number for easy comparison + display alongside %.
   */
  credibilityScore: number;
}

/**
 * Wilson score interval lower bound at 95% confidence.
 * Returns a value in [0, 1].
 *
 * Inputs:
 *   successes — weighted true count (true + 0.5 * half-true)
 *   total — total claim count
 *
 * Edge case: when total === 0 returns 0 (can't rank an empty sample).
 *
 * Math: standard Wilson lower-bound formula. See
 * https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval#Wilson_score_interval
 *
 * Exported so the politician profile page can compute it inline from
 * window-filtered claims (without re-querying via getPoliticianStats).
 */
export function wilsonLowerBound(successes: number, total: number): number {
  if (total === 0) return 0;
  const z = 1.96; // 95% confidence
  const phat = successes / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const center = phat + z2 / (2 * total);
  const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * total)) / total);
  return Math.max(0, (center - margin) / denom);
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
      // Weighted "successes" for both the raw % and the Wilson interval —
      // half-truths count as 0.5 (matches our existing public formula).
      const weightedTrue = trueClaims + halfTrueClaims * 0.5;
      const truthPercentage =
        total > 0 ? Math.round((weightedTrue / total) * 100) : 0;
      const credibilityScore = Math.round(wilsonLowerBound(weightedTrue, total) * 100);

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
        credibilityScore,
      };
    })
    .filter((s) => s.totalClaims > 0)
    // Sort ascending by credibility score (Wilson lower bound), not raw %.
    // This corrects the small-sample bias: a politician with 3 true claims
    // (raw 100%) ranks BELOW a politician with 50 claims at 80% (raw 80%),
    // because the latter has a much narrower confidence interval. The
    // display layer (leaderboard / hero) still shows the raw % for
    // familiarity — only the ORDER reflects sample-size adjustment.
    .sort((a, b) => a.credibilityScore - b.credibilityScore);
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
    .map(([party, stats]) => {
      const weightedTrue = stats.trueClaims + stats.halfTrue * 0.5;
      return {
        party,
        ...stats,
        truthPercentage: Math.round((weightedTrue / stats.total) * 100),
        // Wilson 95% CI lower bound — same sample-size adjustment we apply
        // to per-politician credibility. A 5-claim party at 100% raw still
        // gets a low credibilityScore because the sample's too small to
        // confidently call them credible.
        credibilityScore: Math.round(wilsonLowerBound(weightedTrue, stats.total) * 100),
      };
    })
    .sort((a, b) => a.credibilityScore - b.credibilityScore);
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
