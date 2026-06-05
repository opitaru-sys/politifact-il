/**
 * Structured analysis of one week's fact-check data. Computes every
 * pattern the digest synthesizer needs as a single blob, so the AI
 * step has rich context to draw insights from rather than running
 * its own queries.
 *
 * The patterns here are deliberately non-trivial (not just counts) —
 * persistence, volume-vs-accuracy correlation, week-over-week shifts,
 * cross-week first-appearances. These are the raw observations that
 * become "insights" once narrated in journalist voice.
 *
 * Pure read layer; no writes. Safe to call from a cron, a script,
 * or an admin route.
 */
import { prisma } from "./db";
import { wilsonLowerBound } from "./queries";
import { listCanonicalTopics, rawTopicMatchesSlug } from "./topics";
import { getBiggestMovers, type PoliticianMover } from "./cred-history";

const LOW_CREDIBILITY_THRESHOLD = 40;
const VOLUME_TOP_N = 10;

export interface WeeklyAnalysis {
  weekOf: Date;
  weekStart: Date;

  // ── Basic shape of the week ───────────────────────────────────────
  totalClaims: number;
  distinctPoliticians: number;
  verdictCounts: { true: number; halfTrue: number; false: number };
  truthPercentage: number;

  // ── Week-over-week comparison ─────────────────────────────────────
  prevWeekTotalClaims: number;
  prevWeekTruthPercentage: number | null;
  truthPercentageDelta: number | null;

  // ── Movers (cred-history 7-day) ───────────────────────────────────
  topGainers: PoliticianMover[];
  topLosers: PoliticianMover[];

  // ── Topic distribution ────────────────────────────────────────────
  /** Per canonical topic: count this week + topic-aggregate truth %. */
  topicDistribution: {
    slug: string;
    label: string;
    count: number;
    truthPercentage: number | null;
    pctOfWeek: number;
  }[];
  /** Topic with the lowest truth % among those with ≥3 claims. */
  worstTopic: { slug: string; label: string; truthPercentage: number; count: number } | null;
  /** Topic with the highest truth % among those with ≥3 claims. */
  bestTopic: { slug: string; label: string; truthPercentage: number; count: number } | null;

  // ── Misleaders (the digest's lead) ────────────────────────────────
  /** Politicians ranked by THIS WEEK's weighted lie score (false×1 +
   *  half-true×0.5), highest first. This is the lead story: who misled
   *  the public most this week. Mirrors the homepage hero's "המטעה
   *  המוביל". Minimum 3 claims to qualify so a lone false claim can't
   *  top the list. */
  topMisleaders: {
    politicianId: string;
    politicianName: string;
    party: string;
    claimCount: number;
    lieScore: number;
    falseCount: number;
    halfCount: number;
    trueCount: number;
    truthPercentage: number;
  }[];

  // ── Volume vs. accuracy ───────────────────────────────────────────
  /** Top-N most-quoted politicians this week (raw claim count). */
  topByVolume: {
    politicianId: string;
    politicianName: string;
    party: string;
    claimCount: number;
    truthPercentage: number;
  }[];
  /** Average truth % across topByVolume vs. overall — quantifies the
   *  "loudest voices are least reliable" / opposite pattern. */
  topVolumeAvgTruth: number | null;
  /** Average truth % across all politicians who spoke this week. */
  weekAvgTruth: number | null;

  // ── Persistence (was-bad-last-week → still-bad-this-week) ─────────
  /** Politicians whose credibility was <40% in the snapshot 7 days ago
   *  AND are still <40% today. The persistence rate = persistent /
   *  totalLowLast — the proportion of "low last week" that stayed low. */
  persistentLow: number;
  totalLowLastWeek: number;

  // ── First-time politicians this week ──────────────────────────────
  firstTimePoliticians: { id: string; name: string; party: string }[];

  // ── Source mix ────────────────────────────────────────────────────
  sourceCounts: { source: string; count: number; truthPercentage: number }[];

  // ── Verdict pattern shape ─────────────────────────────────────────
  /** Useful for narrating "shift toward half-truth" / "outright lies
   *  dominated" patterns. */
  verdictShareThisWeek: { true: number; halfTrue: number; false: number };
  verdictShareLastWeek: { true: number; halfTrue: number; false: number } | null;
}

export async function analyzeWeek(weekOf: Date): Promise<WeeklyAnalysis> {
  const weekStart = new Date(weekOf);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setUTCDate(prevWeekStart.getUTCDate() - 7);

  // Pull all this-week and prev-week claims with politician + source.
  const [thisWeek, prevWeek] = await Promise.all([
    prisma.claim.findMany({
      where: {
        status: "published",
        editorApproved: true,
        date: { gte: weekStart, lte: weekOf },
      },
      include: { politician: true },
    }),
    prisma.claim.findMany({
      where: {
        status: "published",
        editorApproved: true,
        date: { gte: prevWeekStart, lt: weekStart },
      },
      select: { verdict: true, politicianId: true },
    }),
  ]);

  // ── Basic counts ──
  const verdictCounts = {
    true: thisWeek.filter((c) => c.verdict === "true").length,
    halfTrue: thisWeek.filter((c) => c.verdict === "half-true").length,
    false: thisWeek.filter((c) => c.verdict === "false").length,
  };
  const totalClaims = thisWeek.length;
  const weightedTrue = verdictCounts.true + verdictCounts.halfTrue * 0.5;
  const truthPercentage =
    totalClaims > 0 ? Math.round((weightedTrue / totalClaims) * 100) : 0;
  const distinctPoliticians = new Set(thisWeek.map((c) => c.politicianId)).size;

  // ── Week-over-week ──
  const prevWeekTotalClaims = prevWeek.length;
  const prevWeighted =
    prevWeek.filter((c) => c.verdict === "true").length +
    prevWeek.filter((c) => c.verdict === "half-true").length * 0.5;
  const prevWeekTruthPercentage =
    prevWeekTotalClaims > 0 ? Math.round((prevWeighted / prevWeekTotalClaims) * 100) : null;
  const truthPercentageDelta =
    prevWeekTruthPercentage !== null ? truthPercentage - prevWeekTruthPercentage : null;

  // ── Movers ──
  const movers = await getBiggestMovers({ daysBack: 7, minSample: 10, topN: 3 });

  // ── Topic distribution ──
  const topicMap = new Map<string, { slug: string; label: string; trueC: number; half: number; falseC: number; total: number }>();
  for (const c of thisWeek) {
    for (const { slug, label } of listCanonicalTopics()) {
      if (rawTopicMatchesSlug(c.topic, slug)) {
        const existing = topicMap.get(slug);
        if (existing) {
          existing.total++;
          if (c.verdict === "true") existing.trueC++;
          else if (c.verdict === "half-true") existing.half++;
          else if (c.verdict === "false") existing.falseC++;
        } else {
          topicMap.set(slug, {
            slug,
            label,
            trueC: c.verdict === "true" ? 1 : 0,
            half: c.verdict === "half-true" ? 1 : 0,
            falseC: c.verdict === "false" ? 1 : 0,
            total: 1,
          });
        }
        break;
      }
    }
  }
  const topicDistribution = Array.from(topicMap.values())
    .map((t) => {
      const w = t.trueC + t.half * 0.5;
      return {
        slug: t.slug,
        label: t.label,
        count: t.total,
        truthPercentage: t.total > 0 ? Math.round((w / t.total) * 100) : null,
        pctOfWeek: totalClaims > 0 ? Math.round((t.total / totalClaims) * 100) : 0,
      };
    })
    .sort((a, b) => b.count - a.count);

  // Filter with a type predicate so TypeScript narrows `truthPercentage`
  // from `number | null` to `number` for the reducers below.
  const meaningfulTopics = topicDistribution.filter(
    (t): t is typeof t & { truthPercentage: number } =>
      t.count >= 3 && t.truthPercentage !== null,
  );
  const worstTopic = meaningfulTopics.length
    ? (() => {
        const w = meaningfulTopics.reduce((best, t) =>
          t.truthPercentage < best.truthPercentage ? t : best,
        );
        return { slug: w.slug, label: w.label, truthPercentage: w.truthPercentage, count: w.count };
      })()
    : null;
  const bestTopic = meaningfulTopics.length
    ? (() => {
        const b = meaningfulTopics.reduce((best, t) =>
          t.truthPercentage > best.truthPercentage ? t : best,
        );
        return { slug: b.slug, label: b.label, truthPercentage: b.truthPercentage, count: b.count };
      })()
    : null;

  // ── Per-politician this-week stats (for volume vs. accuracy) ──
  const polMap = new Map<string, { id: string; name: string; party: string; trueC: number; half: number; total: number }>();
  for (const c of thisWeek) {
    const existing = polMap.get(c.politicianId);
    if (existing) {
      existing.total++;
      if (c.verdict === "true") existing.trueC++;
      else if (c.verdict === "half-true") existing.half++;
    } else {
      polMap.set(c.politicianId, {
        id: c.politicianId,
        name: c.politician.name,
        party: c.politician.party,
        trueC: c.verdict === "true" ? 1 : 0,
        half: c.verdict === "half-true" ? 1 : 0,
        total: 1,
      });
    }
  }
  const allPolThisWeek = Array.from(polMap.values()).map((p) => {
    const w = p.trueC + p.half * 0.5;
    // False count is whatever's left after true + half. lieScore mirrors
    // the site-wide weighted lie score: a full false is 1, a half-true is
    // 0.5, a true is 0.
    const falseC = p.total - p.trueC - p.half;
    const lieScore = Math.round((falseC + p.half * 0.5) * 10) / 10;
    return {
      ...p,
      falseC,
      lieScore,
      truthPercentage: p.total > 0 ? Math.round((w / p.total) * 100) : 0,
    };
  });
  const weekAvgTruth =
    allPolThisWeek.length > 0
      ? Math.round(allPolThisWeek.reduce((s, x) => s + x.truthPercentage, 0) / allPolThisWeek.length)
      : null;

  // ── Misleaders: this week's worst offenders by weighted lie score ──
  // The digest leads with these. Min 3 claims so a single false statement
  // doesn't crown someone the week's top misleader on a sample of one.
  const MISLEADER_MIN_CLAIMS = 3;
  const topMisleaders = [...allPolThisWeek]
    .filter((p) => p.total >= MISLEADER_MIN_CLAIMS && p.lieScore > 0)
    .sort((a, b) => b.lieScore - a.lieScore)
    .slice(0, 5)
    .map((p) => ({
      politicianId: p.id,
      politicianName: p.name,
      party: p.party,
      claimCount: p.total,
      lieScore: p.lieScore,
      falseCount: p.falseC,
      halfCount: p.half,
      trueCount: p.trueC,
      truthPercentage: p.truthPercentage,
    }));

  const topByVolumeRaw = [...allPolThisWeek].sort((a, b) => b.total - a.total).slice(0, VOLUME_TOP_N);
  const topByVolume = topByVolumeRaw.map((p) => ({
    politicianId: p.id,
    politicianName: p.name,
    party: p.party,
    claimCount: p.total,
    truthPercentage: p.truthPercentage,
  }));
  const topVolumeAvgTruth =
    topByVolume.length > 0
      ? Math.round(topByVolume.reduce((s, p) => s + p.truthPercentage, 0) / topByVolume.length)
      : null;

  // ── Persistence: was <40% in the snapshot 7d ago, still <40% today ──
  const today = new Date();
  today.setUTCHours(23, 59, 59, 999);
  const sevenAgo = new Date(today);
  sevenAgo.setUTCDate(sevenAgo.getUTCDate() - 7);
  // Grab the most recent snapshot per politician for "now" and the
  // nearest one >= sevenAgo for "last week".
  const recentSnaps = await prisma.credibilitySnapshot.findMany({
    where: { windowDays: 30, asOf: { gte: new Date(sevenAgo.getTime() - 4 * 24 * 60 * 60 * 1000) } },
    orderBy: { asOf: "desc" },
    select: { politicianId: true, asOf: true, credibilityScore: true, totalClaims: true },
  });
  const byPol = new Map<string, { current?: typeof recentSnaps[number]; week?: typeof recentSnaps[number] }>();
  for (const s of recentSnaps) {
    if (!byPol.has(s.politicianId)) byPol.set(s.politicianId, {});
    const slot = byPol.get(s.politicianId)!;
    if (!slot.current) slot.current = s;
    if (s.asOf <= sevenAgo && !slot.week) slot.week = s;
  }
  let persistentLow = 0;
  let totalLowLastWeek = 0;
  for (const slot of byPol.values()) {
    if (!slot.week || slot.week.totalClaims < 5) continue;
    if (slot.week.credibilityScore >= LOW_CREDIBILITY_THRESHOLD) continue;
    totalLowLastWeek++;
    if (slot.current && slot.current.credibilityScore < LOW_CREDIBILITY_THRESHOLD) {
      persistentLow++;
    }
  }

  // ── First-time politicians this week ──
  const earlierExisting = await prisma.claim.findMany({
    where: {
      status: "published",
      editorApproved: true,
      date: { lt: weekStart },
      politicianId: { in: Array.from(polMap.keys()) },
    },
    select: { politicianId: true },
    distinct: ["politicianId"],
  });
  const seenBefore = new Set(earlierExisting.map((c) => c.politicianId));
  const firstTimePoliticians = allPolThisWeek
    .filter((p) => !seenBefore.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, party: p.party }));

  // ── Source mix ──
  const sourceMap = new Map<string, { trueC: number; half: number; total: number }>();
  for (const c of thisWeek) {
    const existing = sourceMap.get(c.source) ?? { trueC: 0, half: 0, total: 0 };
    existing.total++;
    if (c.verdict === "true") existing.trueC++;
    else if (c.verdict === "half-true") existing.half++;
    sourceMap.set(c.source, existing);
  }
  const sourceCounts = Array.from(sourceMap.entries())
    .map(([source, s]) => {
      const w = s.trueC + s.half * 0.5;
      return {
        source,
        count: s.total,
        truthPercentage: s.total > 0 ? Math.round((w / s.total) * 100) : 0,
      };
    })
    .sort((a, b) => b.count - a.count);

  // ── Verdict share shape ──
  const verdictShareThisWeek =
    totalClaims > 0
      ? {
          true: Math.round((verdictCounts.true / totalClaims) * 100),
          halfTrue: Math.round((verdictCounts.halfTrue / totalClaims) * 100),
          false: Math.round((verdictCounts.false / totalClaims) * 100),
        }
      : { true: 0, halfTrue: 0, false: 0 };
  const prevVerdictCounts = {
    true: prevWeek.filter((c) => c.verdict === "true").length,
    halfTrue: prevWeek.filter((c) => c.verdict === "half-true").length,
    false: prevWeek.filter((c) => c.verdict === "false").length,
  };
  const verdictShareLastWeek =
    prevWeekTotalClaims > 0
      ? {
          true: Math.round((prevVerdictCounts.true / prevWeekTotalClaims) * 100),
          halfTrue: Math.round((prevVerdictCounts.halfTrue / prevWeekTotalClaims) * 100),
          false: Math.round((prevVerdictCounts.false / prevWeekTotalClaims) * 100),
        }
      : null;

  // unused intentionally — kept for callers that want the raw helper
  void wilsonLowerBound;

  return {
    weekOf,
    weekStart,
    totalClaims,
    distinctPoliticians,
    verdictCounts,
    truthPercentage,
    prevWeekTotalClaims,
    prevWeekTruthPercentage,
    truthPercentageDelta,
    topGainers: movers.gainers,
    topLosers: movers.losers,
    topicDistribution,
    worstTopic,
    bestTopic,
    topMisleaders,
    topByVolume,
    topVolumeAvgTruth,
    weekAvgTruth,
    persistentLow,
    totalLowLastWeek,
    firstTimePoliticians,
    sourceCounts,
    verdictShareThisWeek,
    verdictShareLastWeek,
  };
}
