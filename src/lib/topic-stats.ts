/**
 * Topic-scoped queries powering `/topic/[slug]`. Filters all the
 * existing aggregations (politician credibility, recent claims feed)
 * down to claims whose raw `topic` field matches a canonical category.
 *
 * Why we filter in-memory instead of pushing to SQL: the Claim.topic
 * column stores free-text AI-extracted strings ("מדיניות הביטחון
 * בגבול הצפון", "מבצע צבאי בעזה", ...) — the canonical buckets are
 * defined by regexes in topics.ts that include character-class metas
 * (`בית.המשפט`) which don't translate cleanly to Prisma `contains`
 * predicates. Loading the politicians-with-claims set and filtering
 * client-side is straightforward and fast enough at our current scale
 * (~3000 approved claims). If the corpus grows large enough that this
 * becomes a hot spot, add a `normalizedTopic` column to Claim and
 * index it; backfill via a one-off script.
 */
import { prisma } from "./db";
import { cachedRead } from "./cache";
import { wilsonLowerBound, type PoliticianStatsRow } from "./queries";
import { listCanonicalTopics, rawTopicMatchesSlug } from "./topics";

const PUBLIC_CLAIM_FILTER = { status: "published", editorApproved: true } as const;

/**
 * Per-politician stats for one topic. Same shape as `getPoliticianStats`
 * so the same row components can render it.
 */
async function computePoliticianStatsForTopic(
  slug: string,
  windowDays?: number,
): Promise<PoliticianStatsRow[]> {
  const cutoff = windowDays !== undefined ? new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000) : null;

  const politicians = await prisma.politician.findMany({
    include: {
      claims: {
        where: {
          ...PUBLIC_CLAIM_FILTER,
          ...(cutoff ? { date: { gte: cutoff } } : {}),
        },
        select: { verdict: true, topic: true },
      },
    },
  });

  const rows: PoliticianStatsRow[] = [];
  for (const p of politicians) {
    const topicClaims = p.claims.filter((c) => rawTopicMatchesSlug(c.topic, slug));
    if (topicClaims.length === 0) continue;
    const trueClaims = topicClaims.filter((c) => c.verdict === "true").length;
    const halfTrueClaims = topicClaims.filter((c) => c.verdict === "half-true").length;
    const falseClaims = topicClaims.filter((c) => c.verdict === "false").length;
    const total = topicClaims.length;
    const weightedTrue = trueClaims + halfTrueClaims * 0.5;
    rows.push({
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
      truthPercentage: Math.round((weightedTrue / total) * 100),
      credibilityScore: Math.round(wilsonLowerBound(weightedTrue, total) * 100),
      lieScore: falseClaims + halfTrueClaims * 0.5,
    });
  }

  // Default sort: most credible first (the topic PAGE still shows the
  // credibility framing — it gets the lie-score reframe in a follow-up).
  rows.sort((a, b) => b.credibilityScore - a.credibilityScore);
  return rows;
}

/**
 * Cached wrapper. Loads every politician with claims and filters in memory
 * by topic regex — heavy, and called by both the topic page and its OG
 * image. Date-free return. 5-min TTL.
 */
export const getPoliticianStatsForTopic = cachedRead(
  computePoliticianStatsForTopic,
  ["topic-politician-stats"],
  { revalidate: 300, tags: ["claims"] },
);

/**
 * Recent claims for one topic. Returns claims + politician + comment
 * count, same shape as `queries.getRecentClaims`.
 *
 * Note: we must fetch the WHOLE window (capped at SAFETY_CAP) and filter
 * in-memory because topic matching uses regex (NORMALIZATIONS in
 * topics.ts) that doesn't translate to a Prisma predicate. An earlier
 * version used `take: limit * 5` as a heuristic over-fetch, which
 * worked for popular topics like ביטחון but silently returned 0 for
 * sparse topics whose claims were older than the most-recent N. Now we
 * scan the whole window so every topic returns the right slice.
 *
 * SAFETY_CAP guards against pathological "all-time" pulls. At current
 * scale (~3k approved claims total) this never kicks in.
 */
const SAFETY_CAP = 5000;

/**
 * Top N canonical topics by claim count in the active window, with
 * aggregate truth % per topic. Used by the home page's TopicHighlights
 * strip so visitors can browse into /topic/[slug] from a prominent
 * surface instead of needing to know the URL.
 *
 * Loads the window's claims once and groups in memory; same pattern
 * as the per-topic stats functions above.
 */
async function computeTopTopicsForWindow(
  windowDays?: number,
  limit: number = 5,
): Promise<
  {
    slug: string;
    label: string;
    claimCount: number;
    truthPercentage: number;
    politicianCount: number;
  }[]
> {
  const cutoff = windowDays !== undefined ? new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000) : null;
  const claims = await prisma.claim.findMany({
    where: {
      ...PUBLIC_CLAIM_FILTER,
      ...(cutoff ? { date: { gte: cutoff } } : {}),
    },
    select: { verdict: true, topic: true, politicianId: true },
    take: SAFETY_CAP,
  });

  const rows = listCanonicalTopics().map(({ slug, label }) => {
    const matching = claims.filter((c) => rawTopicMatchesSlug(c.topic, slug));
    const trueC = matching.filter((c) => c.verdict === "true").length;
    const halfT = matching.filter((c) => c.verdict === "half-true").length;
    const weighted = trueC + halfT * 0.5;
    return {
      slug,
      label,
      claimCount: matching.length,
      truthPercentage: matching.length > 0 ? Math.round((weighted / matching.length) * 100) : 0,
      politicianCount: new Set(matching.map((c) => c.politicianId)).size,
    };
  });

  return rows
    .filter((r) => r.claimCount > 0)
    .sort((a, b) => b.claimCount - a.claimCount)
    .slice(0, limit);
}

export const getTopTopicsForWindow = cachedRead(
  computeTopTopicsForWindow,
  ["top-topics"],
  { revalidate: 300, tags: ["claims"] },
);

export async function getRecentClaimsForTopic(
  slug: string,
  windowDays?: number,
  limit: number = 50,
) {
  const cutoff = windowDays !== undefined ? new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000) : null;

  const candidates = await prisma.claim.findMany({
    where: {
      ...PUBLIC_CLAIM_FILTER,
      ...(cutoff ? { date: { gte: cutoff } } : {}),
    },
    include: {
      politician: true,
      _count: { select: { comments: true } },
    },
    orderBy: { date: "desc" },
    take: SAFETY_CAP,
  });

  return candidates
    .filter((c) => rawTopicMatchesSlug(c.topic, slug))
    .slice(0, limit);
}
