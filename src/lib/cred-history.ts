/**
 * Credibility history reads — powers the politician profile timeline
 * chart and the home-page BiggestMovers card.
 *
 * Snapshot generation lives in scripts/snapshot-credibility.mts (nightly,
 * wired into scripts/daily.mts) and scripts/backfill-cred-snapshots.mts
 * (one-off for the 12 months prior to launch). Reads here are pure
 * Prisma queries against the pre-baked `CredibilitySnapshot` table —
 * no Wilson math at read time.
 */
import { prisma } from "./db";

/** Default rolling window for every credibility computation on the site. */
export const DEFAULT_WINDOW_DAYS = 30;

/** One point on the timeline chart. */
export interface TimelinePoint {
  asOf: Date;
  totalClaims: number;
  trueClaims: number;
  halfTrue: number;
  falseClaims: number;
  truthPercentage: number;
  credibilityScore: number;
}

/** One row in the BiggestMovers card. */
export interface PoliticianMover {
  politician: {
    id: string;
    name: string;
    party: string;
    image: string | null;
  };
  currentScore: number;
  previousScore: number;
  /** currentScore - previousScore. Positive = gained, negative = lost. */
  delta: number;
  currentSample: number;
  previousSample: number;
}

/**
 * Returns ordered timeline of credibility snapshots for one politician,
 * over the last N months. Used by the profile-page chart.
 *
 * Caller is responsible for choosing the months window — the chart
 * exposes a 3/6/12 selector.
 */
export async function getPoliticianTimeline(
  politicianId: string,
  monthsBack: number,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Promise<TimelinePoint[]> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - monthsBack);

  try {
    const rows = await prisma.credibilitySnapshot.findMany({
      where: {
        politicianId,
        windowDays,
        asOf: { gte: cutoff },
      },
      orderBy: { asOf: "asc" },
      select: {
        asOf: true,
        totalClaims: true,
        trueClaims: true,
        halfTrue: true,
        falseClaims: true,
        truthPercentage: true,
        credibilityScore: true,
      },
    });
    return rows;
  } catch (err) {
    console.error("getPoliticianTimeline: DB unreachable", err);
    return [];
  }
}

/**
 * Top gainers and losers between now and N days ago.
 *
 * Politicians must have at least `minSample` claims in BOTH windows
 * to be eligible — below that, change is noise rather than signal
 * (same logic as the Wilson sample-size adjustment we use for the
 * static leaderboard).
 *
 * Default daysBack=7 means "this week vs. last week". 30 is also
 * reasonable for a calmer "this month vs. last month" view.
 */
export async function getBiggestMovers(opts: {
  daysBack?: number;
  windowDays?: number;
  minSample?: number;
  topN?: number;
} = {}): Promise<{ gainers: PoliticianMover[]; losers: PoliticianMover[] }> {
  const daysBack = opts.daysBack ?? 7;
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS;
  const minSample = opts.minSample ?? 15;
  const topN = opts.topN ?? 3;

  // We want the snapshot whose `asOf` is closest to "now" and the one
  // closest to "now - daysBack". Snapshots are written nightly, so we
  // pick the latest snapshot per politician for each anchor.
  //
  // Anchor both to end-of-day UTC because the snapshot job writes rows
  // with asOf=23:59:59. Comparing against mid-day timestamps would
  // miss every snapshot from the target day.
  const now = new Date();
  now.setUTCHours(23, 59, 59, 999);
  const earlier = new Date(now);
  earlier.setDate(earlier.getDate() - daysBack);

  try {
    // Pull all snapshots in a window that covers both anchors. Snapshots
    // are small (one row per politician per day) so a single query is
    // fine even at 365 days × 120 politicians = 44k rows max.
    // Generous 4-day grace so we find the nearest snapshot when the
    // backfill is weekly (gap can be up to 7 days).
    const fromDate = new Date(earlier);
    fromDate.setDate(fromDate.getDate() - 4);
    const snapshots = await prisma.credibilitySnapshot.findMany({
      where: { windowDays, asOf: { gte: fromDate } },
      orderBy: { asOf: "desc" },
      select: {
        politicianId: true,
        asOf: true,
        credibilityScore: true,
        totalClaims: true,
        politician: {
          select: { id: true, name: true, party: true, image: true },
        },
      },
    });

    // Group by politicianId. For each politician we want:
    //   current  = newest snapshot
    //   previous = newest snapshot whose asOf <= `earlier`
    const byPolitician = new Map<
      string,
      { current?: typeof snapshots[number]; previous?: typeof snapshots[number] }
    >();
    for (const s of snapshots) {
      if (!byPolitician.has(s.politicianId)) byPolitician.set(s.politicianId, {});
      const slot = byPolitician.get(s.politicianId)!;
      if (!slot.current) slot.current = s; // first iteration is newest (orderBy desc)
      if (s.asOf <= earlier && !slot.previous) slot.previous = s;
    }

    const movers: PoliticianMover[] = [];
    for (const { current, previous } of byPolitician.values()) {
      if (!current || !previous) continue;
      if (current.totalClaims < minSample || previous.totalClaims < minSample) continue;
      movers.push({
        politician: current.politician,
        currentScore: current.credibilityScore,
        previousScore: previous.credibilityScore,
        delta: current.credibilityScore - previous.credibilityScore,
        currentSample: current.totalClaims,
        previousSample: previous.totalClaims,
      });
    }

    // Gainers: largest positive delta first. Tie-break by larger sample
    // (more confidence in the move).
    const gainers = movers
      .filter((m) => m.delta > 0)
      .sort((a, b) => {
        if (b.delta !== a.delta) return b.delta - a.delta;
        return b.currentSample - a.currentSample;
      })
      .slice(0, topN);

    // Losers: most-negative delta first.
    const losers = movers
      .filter((m) => m.delta < 0)
      .sort((a, b) => {
        if (a.delta !== b.delta) return a.delta - b.delta;
        return b.currentSample - a.currentSample;
      })
      .slice(0, topN);

    return { gainers, losers };
  } catch (err) {
    console.error("getBiggestMovers: DB unreachable", err);
    return { gainers: [], losers: [] };
  }
}
