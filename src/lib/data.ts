import * as queries from "./queries";
import * as mock from "@/data/mock";

/** All stats (leaderboard, parties, hero) are computed over a rolling window. */
export const STATS_WINDOW_DAYS = 30;
/** Minimum claims in the window to appear in the full leaderboard.
 *  Bumped 1 → 3: with one claim, a politician shows 0% or 100% which is
 *  noise, not signal. Three is the smallest count where a verdict mix
 *  is meaningful (same threshold as the hero card). Politicians with
 *  fewer claims still have an individual page but don't appear in
 *  rankings. */
export const MIN_CLAIMS_FOR_RANKING = 3;
/** Minimum claims to qualify for the "most credible" / "least credible" hero spots.
 *  Three is the smallest number where a verdict mix is meaningful. */
export const MIN_CLAIMS_FOR_HERO = 3;

export type SerializedClaim = mock.Claim & {
  _politician?: { id: string; name: string; party: string; image?: string | null };
  _commentCount?: number;
};

export async function getRecentClaims(
  days: number = STATS_WINDOW_DAYS,
  opts: queries.RecentClaimsOpts = {},
): Promise<SerializedClaim[]> {
  const hasReal = await queries.hasAnyPublishedClaims();
  if (hasReal) {
    const claims = await queries.getRecentClaims(days, opts);
    return claims.map((c) => ({
      id: c.id,
      politicianId: c.politicianId,
      quote: c.quote,
      verdict: c.verdict as mock.Verdict,
      summary: c.summary,
      explanation: c.explanation,
      source: c.source,
      sourceUrl: c.sourceUrl,
      factSource: c.factSource,
      factSourceUrl: c.factSourceUrl,
      editorApproved: c.editorApproved,
      verifierNotes: c.verifierNotes,
      date: c.date.toISOString().split("T")[0],
      topic: c.topic,
      _politician: {
        id: c.politician.id,
        name: c.politician.name,
        party: c.politician.party,
        image: c.politician.image,
      },
      _commentCount: c._count.comments,
    }));
  }
  // Mock path: apply the same filters in memory so dev mode without
  // a real DB still gets correct topic / politician / pagination.
  let claims = mock.getRecentClaims(days);
  if (opts.topic) claims = claims.filter((c) => c.topic === opts.topic);
  if (opts.politicianId) claims = claims.filter((c) => c.politicianId === opts.politicianId);
  if (opts.offset !== undefined) claims = claims.slice(opts.offset);
  if (opts.limit !== undefined) claims = claims.slice(0, opts.limit);
  return claims.map((c) => ({
    ...c,
    _politician: mock.getPolitician(c.politicianId)
      ? { ...mock.getPolitician(c.politicianId)!, image: mock.getPolitician(c.politicianId)!.image ?? null }
      : undefined,
    _commentCount: 0,
  }));
}

/**
 * Map of politicianId → minimal KnessetActivity snapshot. One row per
 * MK we've matched to the Knesset OData. Used by the leaderboard to
 * filter for the minimum-participation threshold, by the scatter
 * chart, and anywhere else activity data needs to be joined to
 * politician stats.
 *
 * Returns an empty map gracefully if the DB is unreachable so the
 * leaderboard still renders during a Neon cold-start.
 */
export interface ActivitySnapshot {
  plenumParticipationPct: number;
  plenumSessionsTotal: number;
  plenumSessionsSpoken: number;
  billsSponsored: number;
}
/**
 * Per-party plenum participation aggregate.
 *
 * For each party, averages `plenumParticipationPct` across the MKs we
 * have activity data for. Returns a map keyed on the politician.party
 * string so /parties can join it directly to PartyStats rows.
 *
 * The average is unweighted — each MK contributes equally regardless
 * of how many sessions there were. Editorially this is the right
 * thing for "how active is this party on average" because we want
 * to detect parties where most MKs are absent, not whitewash a
 * party with one very-active speaker.
 */
export async function getPartyParticipationMap(): Promise<
  Map<string, { avgPct: number; mkCount: number }>
> {
  try {
    const { prisma } = await import("./db");
    const rows = await prisma.knessetActivity.findMany({
      select: {
        plenumParticipationPct: true,
        politician: { select: { party: true } },
      },
    });
    const byParty = new Map<string, number[]>();
    for (const r of rows) {
      const p = r.politician.party;
      if (!p) continue;
      if (!byParty.has(p)) byParty.set(p, []);
      byParty.get(p)!.push(r.plenumParticipationPct);
    }
    const result = new Map<string, { avgPct: number; mkCount: number }>();
    for (const [party, pcts] of byParty) {
      const avg = pcts.reduce((s, x) => s + x, 0) / pcts.length;
      result.set(party, { avgPct: avg, mkCount: pcts.length });
    }
    return result;
  } catch (err) {
    console.error("getPartyParticipationMap: DB unreachable", err);
    return new Map();
  }
}

export async function getKnessetActivityMap(): Promise<Map<string, ActivitySnapshot>> {
  try {
    const { prisma } = await import("./db");
    const rows = await prisma.knessetActivity.findMany({
      select: {
        politicianId: true,
        plenumParticipationPct: true,
        plenumSessionsTotal: true,
        plenumSessionsSpoken: true,
        billsSponsored: true,
      },
    });
    return new Map(
      rows.map((r) => [
        r.politicianId,
        {
          plenumParticipationPct: r.plenumParticipationPct,
          plenumSessionsTotal: r.plenumSessionsTotal,
          plenumSessionsSpoken: r.plenumSessionsSpoken,
          billsSponsored: r.billsSponsored,
        },
      ]),
    );
  } catch (err) {
    console.error("getKnessetActivityMap: DB unreachable", err);
    return new Map();
  }
}

/** Total matching the same filters. Used by the feed header so the
 *  count reflects the entire window, not just the first page. */
export async function getRecentClaimsCount(
  days: number = STATS_WINDOW_DAYS,
  opts: queries.RecentClaimsOpts = {},
): Promise<number> {
  const hasReal = await queries.hasAnyPublishedClaims();
  if (hasReal) return queries.getRecentClaimsCount(days, opts);
  let claims = mock.getRecentClaims(days);
  if (opts.topic) claims = claims.filter((c) => c.topic === opts.topic);
  if (opts.politicianId) claims = claims.filter((c) => c.politicianId === opts.politicianId);
  return claims.length;
}

export async function getPoliticianStats(
  windowDays: number | undefined = STATS_WINDOW_DAYS,
): Promise<queries.PoliticianStatsRow[]> {
  const hasReal = await queries.hasAnyPublishedClaims();
  if (hasReal) {
    const stats = await queries.getPoliticianStats(windowDays);
    return stats.filter((s) => s.totalClaims >= MIN_CLAIMS_FOR_RANKING);
  }
  return mock.getPoliticianStats()
    .filter((s) => s.totalClaims >= MIN_CLAIMS_FOR_RANKING)
    .map((s) => ({
      ...s,
      politician: {
        ...s.politician,
        role: s.politician.role ?? null,
        image: s.politician.image ?? null,
      },
      // Mock fallback (no real claims yet): stub credibilityScore = raw %.
      credibilityScore: s.truthPercentage,
      lieScore: s.falseClaims + s.halfTrueClaims * 0.5,
    }));
}

export async function getPartyStats(
  windowDays: number | undefined = STATS_WINDOW_DAYS,
) {
  const hasReal = await queries.hasAnyPublishedClaims();
  if (hasReal) {
    return queries.getPartyStats(windowDays);
  }
  // Mock fallback: stub credibilityScore = truthPercentage. Mock data
  // isn't statistically meaningful so the distinction is moot here.
  return mock.getPartyStats().map((s) => ({
    ...s,
    credibilityScore: s.truthPercentage,
    lieScore: s.falseClaims + s.halfTrue * 0.5,
  }));
}

export async function getPoliticianById(id: string) {
  const hasReal = await queries.hasAnyPublishedClaims();
  if (hasReal) {
    const p = await queries.getPoliticianById(id);
    if (!p) return null;
    return {
      ...p,
      claims: p.claims.map((c) => ({
        id: c.id,
        politicianId: c.politicianId,
        quote: c.quote,
        verdict: c.verdict as mock.Verdict,
        summary: c.summary,
        explanation: c.explanation,
        source: c.source,
        sourceUrl: c.sourceUrl,
        factSource: c.factSource,
        factSourceUrl: c.factSourceUrl,
        editorApproved: c.editorApproved,
      verifierNotes: c.verifierNotes,
        date: c.date.toISOString().split("T")[0],
        topic: c.topic,
        _politician: {
          id: p.id,
          name: p.name,
          party: p.party,
          image: p.image,
        },
        _commentCount: c._count?.comments ?? 0,
      })),
    };
  }
  const politician = mock.getPolitician(id);
  if (!politician) return null;
  return {
    ...politician,
    createdAt: new Date(),
    updatedAt: new Date(),
    claims: mock.getClaimsForPolitician(id).map((c) => ({
      ...c,
      _politician: { id: politician.id, name: politician.name, party: politician.party, image: politician.image ?? null },
    })),
  };
}

export async function getAllPoliticianIds(): Promise<string[]> {
  const hasReal = await queries.hasAnyPublishedClaims();
  if (hasReal) {
    const all = await queries.getAllPoliticians();
    return all.filter((p) => p.claims.length > 0).map((p) => p.id);
  }
  return mock.politicians.map((p) => p.id);
}

/** Politicians who exist but have no claims in the window. Used on leaderboard. */
export async function getUnrankedPoliticians(
  windowDays: number | undefined = STATS_WINDOW_DAYS,
) {
  const hasReal = await queries.hasAnyPublishedClaims();
  if (!hasReal) return [];
  const all = await queries.getUnrankedPoliticians(windowDays);
  return all.map((p) => ({
    id: p.id,
    name: p.name,
    party: p.party,
    image: p.image,
  }));
}

/**
 * Top N politicians by claim count in the active window. Used for the
 * "מי בכותרות" (in-the-news) strip on the home page — solves the
 * "first-time visitors don't see the household names they expect" UX
 * problem. Famous politicians naturally accumulate more claims (more
 * news coverage), so sorting by raw count surfaces them without any
 * editorial curation.
 *
 * Intentionally NOT filtered by `MIN_CLAIMS_FOR_RANKING` — the whole
 * point is to be inclusive of politicians who've been mentioned at all.
 * The credibility score is shown alongside, with its usual sample-size
 * adjustment baked in.
 */
export async function getMostMentionedPoliticians(
  windowDays: number | undefined = STATS_WINDOW_DAYS,
  limit: number = 8,
): Promise<queries.PoliticianStatsRow[]> {
  const hasReal = await queries.hasAnyPublishedClaims();
  if (hasReal) {
    const stats = await queries.getPoliticianStats(windowDays);
    // Sort by total claim count desc; tie-break by credibilityScore
    // so two politicians with equal newsroom volume rank by quality.
    return [...stats]
      .sort((a, b) => {
        if (a.totalClaims !== b.totalClaims) return b.totalClaims - a.totalClaims;
        return b.credibilityScore - a.credibilityScore;
      })
      .slice(0, limit);
  }
  // Mock fallback: same shape, no Wilson.
  return mock.getPoliticianStats()
    .sort((a, b) => b.totalClaims - a.totalClaims)
    .slice(0, limit)
    .map((s) => ({
      ...s,
      politician: {
        ...s.politician,
        role: s.politician.role ?? null,
        image: s.politician.image ?? null,
      },
      credibilityScore: s.truthPercentage,
      lieScore: s.falseClaims + s.halfTrueClaims * 0.5,
    }));
}

/** Lightweight list for search/autocomplete — pulls from real DB if available. */
export async function getAllPoliticiansLite(): Promise<
  { id: string; name: string; party: string; image: string | null }[]
> {
  const hasReal = await queries.hasAnyPublishedClaims();
  if (hasReal) {
    const all = await queries.getAllPoliticians();
    return all.map((p) => ({
      id: p.id,
      name: p.name,
      party: p.party,
      image: p.image,
    }));
  }
  return mock.politicians.map((p) => ({
    id: p.id,
    name: p.name,
    party: p.party,
    image: p.image ?? null,
  }));
}

/**
 * Politicians who actually have at least one publicly-visible claim.
 * Used by the /compare dropdown so users can't pick a politician
 * with no data and hit a dead-end "אין מספיק נתונים" state.
 *
 * Search/autocomplete keeps the full list — search is for discovery,
 * compare is for analysis.
 */
export async function getPoliticiansWithClaimsLite(): Promise<
  { id: string; name: string; party: string; image: string | null; claimCount: number }[]
> {
  const hasReal = await queries.hasAnyPublishedClaims();
  if (hasReal) {
    const all = await queries.getAllPoliticians();
    return all
      .filter((p) => p.claims.length > 0)
      .map((p) => ({
        id: p.id,
        name: p.name,
        party: p.party,
        image: p.image,
        claimCount: p.claims.length,
      }));
  }
  // Mock path: same filter, in memory
  return mock.politicians
    .map((p) => ({
      id: p.id,
      name: p.name,
      party: p.party,
      image: p.image ?? null,
      claimCount: mock.getClaimsForPolitician(p.id).length,
    }))
    .filter((p) => p.claimCount > 0);
}
