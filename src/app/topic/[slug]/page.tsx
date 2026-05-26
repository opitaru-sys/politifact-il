/**
 * Topic landing page. One URL per canonical topic
 * (/topic/security, /topic/economy, /topic/justice, ...).
 *
 * Lives between the home page (broad cross-politician view) and the
 * politician profile (narrow single-politician view) as the third
 * axis: one topic, all politicians. Answers "who's most/least credible
 * on the economy?" in one URL Google can rank for.
 *
 * Data slice only — no AI inference. Uses the existing canonical-topic
 * regex library in src/lib/topics.ts; same one powering the
 * per-politician TopicBreakdown card.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { slugToTopicLabel, listCanonicalTopics } from "@/lib/topics";
import {
  getPoliticianStatsForTopic,
  getRecentClaimsForTopic,
} from "@/lib/topic-stats";
import { getPoliticianStats } from "@/lib/data";
import { PoliticianAvatar } from "@/components/PoliticianAvatar";
import { WindowSelector } from "@/components/WindowSelector";
import { ClaimCard } from "@/components/ClaimCard";
import { ShareButtons } from "@/components/ShareButtons";
import { shareTextForRanking } from "@/lib/share-text";
import { resolveWindow, windowLabel as windowLabelFn } from "@/lib/window";
import type { Claim, Verdict } from "@/data/mock";

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://bduk.co.il";

/** Tells Next.js which slugs are known at build time. Helps SEO crawl
 *  and lets Vercel cache the per-slug shells. */
export async function generateStaticParams() {
  return listCanonicalTopics().map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const label = slugToTopicLabel(slug);
  if (!label) return {};
  return {
    title: `${label} · אמינות פוליטיקאים | בדוק`,
    description: `מי הפוליטיקאים הכי אמינים בנושא ${label}? דירוג מתוקנן לגודל מדגם, מבוסס על טענות שנבדקו אוטומטית.`,
    openGraph: {
      title: `אמינות פוליטיקאים בנושא ${label}`,
      description: `דירוג פוליטיקאים ישראליים על נושא ${label}.`,
      url: `${SITE_URL}/topic/${slug}`,
    },
  };
}

function scoreColor(pct: number): string {
  if (pct < 40) return "var(--verdict-false)";
  if (pct < 60) return "var(--verdict-half)";
  return "var(--verdict-true)";
}

const MIN_FOR_RANKING = 3;
const TOP_BOTTOM_COUNT = 5;
const CLAIMS_FEED_LIMIT = 30;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ window?: string }>;
}

export default async function TopicPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { window: windowParam } = await searchParams;
  const label = slugToTopicLabel(slug);
  if (!label) notFound();

  const selected = resolveWindow(windowParam);
  const winDays = selected.days;
  const windowLabel = windowLabelFn(selected.value);

  const [allStats, recentClaims, overallStats] = await Promise.all([
    getPoliticianStatsForTopic(slug, winDays),
    getRecentClaimsForTopic(slug, winDays, CLAIMS_FEED_LIMIT),
    getPoliticianStats(winDays),
  ]);

  const ranked = allStats.filter((s) => s.totalClaims >= MIN_FOR_RANKING);
  const top = ranked.slice(0, TOP_BOTTOM_COUNT);
  const bottom = [...ranked].reverse().slice(0, TOP_BOTTOM_COUNT);

  // If both lists overlap (small pool), trim the bottom to politicians
  // not already in top so the reader doesn't see the same name twice.
  const topIds = new Set(top.map((s) => s.politician.id));
  const bottomDistinct = bottom.filter((s) => !topIds.has(s.politician.id));

  const totalClaims = allStats.reduce((s, x) => s + x.totalClaims, 0);
  const totalPoliticians = allStats.length;

  // === Insights ===
  // Aggregate "true %" on the topic: sum of (true + 0.5*half) across
  // ALL claims on this topic, divided by total. Treats every claim
  // equally regardless of which politician said it.
  const aggregateTrue = allStats.reduce(
    (s, x) => s + x.trueClaims + x.halfTrueClaims * 0.5,
    0,
  );
  const topicTruthPct = totalClaims > 0 ? Math.round((aggregateTrue / totalClaims) * 100) : null;

  // Site-wide raw % for comparison — same weighted formula.
  const siteTotal = overallStats.reduce((s, x) => s + x.totalClaims, 0);
  const siteTrue = overallStats.reduce(
    (s, x) => s + x.trueClaims + x.halfTrueClaims * 0.5,
    0,
  );
  const siteTruthPct = siteTotal > 0 ? Math.round((siteTrue / siteTotal) * 100) : null;
  const truthDelta =
    topicTruthPct !== null && siteTruthPct !== null ? topicTruthPct - siteTruthPct : null;

  // Largest discrepancy: politician whose credibility on this topic
  // differs most from their overall credibility. Only consider
  // politicians with enough sample in both. Useful insight: "politician
  // X is much better/worse on this topic than they are overall."
  const overallById = new Map(overallStats.map((s) => [s.politician.id, s]));
  const discrepancies = ranked
    .map((topicRow) => {
      const overall = overallById.get(topicRow.politician.id);
      if (!overall || overall.totalClaims < 5) return null;
      return {
        politician: topicRow.politician,
        topicScore: topicRow.credibilityScore,
        overallScore: overall.credibilityScore,
        delta: topicRow.credibilityScore - overall.credibilityScore,
        sample: topicRow.totalClaims,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const biggestStronger = discrepancies.length
    ? discrepancies.reduce((best, d) => (d.delta > best.delta ? d : best))
    : null;
  const biggestWeaker = discrepancies.length
    ? discrepancies.reduce((best, d) => (d.delta < best.delta ? d : best))
    : null;

  // Serialize for the ClaimCard client component.
  const serializedClaims = recentClaims.map((c) => ({
    id: c.id,
    politicianId: c.politicianId,
    quote: c.quote,
    verdict: c.verdict as Verdict,
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
  })) satisfies (Claim & {
    _politician?: { id: string; name: string; party: string; image: string | null };
    _commentCount?: number;
  })[];

  return (
    <div>
      <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-2">
        נושא · {windowLabel}
      </div>
      <div className="flex items-baseline justify-between gap-4 mb-3 flex-wrap">
        <h1 className="text-4xl font-black tracking-tight">{label}</h1>
        <ShareButtons
          text={shareTextForRanking(
            `${label} · אמינות פוליטיקאים`,
            top.map((s) => ({ name: s.politician.name, score: s.credibilityScore })),
            5,
          )}
          url={`${SITE_URL}/topic/${slug}`}
        />
      </div>
      <p className="text-sm text-foreground-muted mb-6 max-w-2xl leading-relaxed">
        אמינות פוליטיקאים ישראליים בנושא {label}.{" "}
        {totalClaims > 0 ? (
          <>
            <span className="text-foreground font-bold">{totalClaims} טענות</span>{" "}
            של <span className="text-foreground font-bold">{totalPoliticians} פוליטיקאים</span> נבדקו{" "}
            {windowLabel === "מכל הזמנים" ? "בכל הזמנים" : `ב-${windowLabel}`}.
          </>
        ) : (
          <>אין מספיק נתונים בנושא הזה בחלון הזמן שנבחר.</>
        )}
      </p>

      <div className="mb-6">
        <WindowSelector basePath={`/topic/${slug}`} selectedValue={selected.value} />
      </div>

      {/* Insights band — the "so what" for the topic page. Compares
          aggregate topic-level credibility to the site average and
          highlights the biggest topic-vs-overall discrepancy. Self-
          hides when the topic has too little data to compute either. */}
      {topicTruthPct !== null && (
        <div
          className="bg-card border border-border-strong overflow-hidden mb-8"
          style={{ borderRadius: 4 }}
        >
          <div className="px-5 py-3.5 border-b border-border">
            <h2 className="font-black text-base tracking-tight">תובנות מהירות</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
            <div className="px-5 py-4">
              <div className="text-[10px] uppercase tracking-wider font-bold text-foreground-muted mb-1">
                ממוצע אמינות בנושא {label}
              </div>
              <div className="flex items-baseline gap-3 mt-2">
                <div
                  className="text-3xl font-black tabular-nums leading-none"
                  style={{ color: scoreColor(topicTruthPct) }}
                >
                  {topicTruthPct}%
                </div>
                {truthDelta !== null && Math.abs(truthDelta) >= 2 && (
                  <div
                    className="text-[12px] font-bold tabular-nums"
                    style={{
                      color: truthDelta > 0 ? "var(--verdict-true)" : "var(--verdict-false)",
                    }}
                  >
                    {truthDelta > 0 ? "↑ +" : "↓ "}{Math.abs(truthDelta)} נק׳ מהממוצע באתר
                  </div>
                )}
                {truthDelta !== null && Math.abs(truthDelta) < 2 && (
                  <div className="text-[12px] text-foreground-muted">
                    בקו עם הממוצע באתר ({siteTruthPct}%)
                  </div>
                )}
              </div>
              <div className="text-[11px] text-foreground-muted mt-2 leading-snug">
                ממוצע משוקלל של {totalClaims} טענות בנושא {label}.{" "}
                {truthDelta !== null && Math.abs(truthDelta) >= 2 && (
                  <>
                    באתר כולו הממוצע הוא {siteTruthPct}%, כלומר פוליטיקאים{" "}
                    {truthDelta > 0 ? "אמינים יותר" : "פחות אמינים"} כאשר הם מדברים על {label}.
                  </>
                )}
              </div>
            </div>

            {(biggestStronger || biggestWeaker) && (
              <div className="px-5 py-4">
                <div className="text-[10px] uppercase tracking-wider font-bold text-foreground-muted mb-2">
                  הבדל בולט מול הציון הכללי
                </div>
                {biggestStronger && biggestStronger.delta > 5 && (
                  <DiscrepancyRow
                    politician={biggestStronger.politician}
                    topicScore={biggestStronger.topicScore}
                    overallScore={biggestStronger.overallScore}
                    delta={biggestStronger.delta}
                    sample={biggestStronger.sample}
                    label={label}
                    tone="positive"
                  />
                )}
                {biggestWeaker && biggestWeaker.delta < -5 && biggestWeaker.politician.id !== biggestStronger?.politician.id && (
                  <DiscrepancyRow
                    politician={biggestWeaker.politician}
                    topicScore={biggestWeaker.topicScore}
                    overallScore={biggestWeaker.overallScore}
                    delta={biggestWeaker.delta}
                    sample={biggestWeaker.sample}
                    label={label}
                    tone="negative"
                  />
                )}
                {(!biggestStronger || Math.abs(biggestStronger.delta) <= 5) &&
                 (!biggestWeaker || Math.abs(biggestWeaker.delta) <= 5) && (
                  <div className="text-[11px] text-foreground-muted leading-relaxed">
                    אין הבדלים משמעותיים: ציוני הפוליטיקאים בנושא זה דומים לציון הכללי שלהם.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {ranked.length === 0 ? (
        <div
          className="bg-card border border-border-strong p-6 text-center"
          style={{ borderRadius: 4 }}
        >
          <p className="text-sm text-foreground-muted">
            אין פוליטיקאים עם {MIN_FOR_RANKING}+ טענות בנושא הזה בחלון הזמן שנבחר.{" "}
            <a href={`/topic/${slug}?window=90`} className="underline hover:no-underline font-bold">
              נסו חלון של 3 חודשים ←
            </a>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
          <RankCard
            title="הכי אמינים בנושא"
            stats={top}
            tone="positive"
          />
          {bottomDistinct.length > 0 && (
            <RankCard
              title="הכי פחות אמינים בנושא"
              stats={bottomDistinct}
              tone="negative"
            />
          )}
        </div>
      )}

      {serializedClaims.length > 0 && (
        <section className="mb-10">
          <div className="flex items-baseline justify-between mb-5 pb-3 border-b-[1.5px] border-border-strong">
            <h2 className="font-black text-xl tracking-tight">
              טענות אחרונות בנושא {label}
            </h2>
            <span className="text-[11px] uppercase tracking-wider text-foreground-muted tabular-nums">
              {serializedClaims.length} טענות
            </span>
          </div>
          <div className="space-y-4">
            {serializedClaims.map((claim) => (
              <ClaimCard key={claim.id} claim={claim} />
            ))}
          </div>
        </section>
      )}

      <OtherTopicsNav currentSlug={slug} />
    </div>
  );
}

function RankCard({
  title,
  stats,
  tone,
}: {
  title: string;
  stats: {
    politician: { id: string; name: string; party: string; image: string | null };
    totalClaims: number;
    truthPercentage: number;
    credibilityScore: number;
  }[];
  tone: "positive" | "negative";
}) {
  const accentColor = tone === "positive" ? "var(--verdict-true)" : "var(--verdict-false)";
  return (
    <div
      className="bg-card border border-border-strong overflow-hidden"
      style={{ borderRadius: 4 }}
    >
      <div className="px-5 py-3.5 border-b border-border">
        <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: accentColor }}>
          {title}
        </div>
      </div>
      <ol>
        {stats.map((stat, i) => (
          <li key={stat.politician.id} className="border-b border-border last:border-b-0">
            <Link
              href={`/politician/${stat.politician.id}`}
              className="flex items-center gap-3 px-5 py-2.5 hover:bg-muted/40 transition-colors"
            >
              <span className="text-sm font-black text-foreground-muted w-5 tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <PoliticianAvatar
                id={stat.politician.id}
                name={stat.politician.name}
                image={stat.politician.image}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{stat.politician.name}</div>
                <div className="text-[11px] text-foreground-muted truncate">{stat.politician.party}</div>
              </div>
              <div className="text-left shrink-0">
                <div
                  className="font-black text-base tabular-nums leading-none"
                  style={{ color: scoreColor(stat.credibilityScore) }}
                  title={`ציון מתוקנן לגודל מדגם. אחוז האמת הגולמי: ${stat.truthPercentage}% מתוך ${stat.totalClaims} טענות.`}
                >
                  {stat.credibilityScore}
                  <span className="text-xs">%</span>
                </div>
                <div className="text-[10px] tabular-nums text-foreground-muted mt-0.5">
                  {stat.totalClaims} טענות
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DiscrepancyRow({
  politician,
  topicScore,
  overallScore,
  delta,
  sample,
  label,
  tone,
}: {
  politician: { id: string; name: string; party: string; image: string | null };
  topicScore: number;
  overallScore: number;
  delta: number;
  sample: number;
  label: string;
  tone: "positive" | "negative";
}) {
  const color = tone === "positive" ? "var(--verdict-true)" : "var(--verdict-false)";
  const sign = delta > 0 ? "+" : "";
  return (
    <Link
      href={`/politician/${politician.id}`}
      className="flex items-center gap-3 py-2 hover:opacity-80 transition-opacity"
    >
      <PoliticianAvatar id={politician.id} name={politician.name} image={politician.image} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate">{politician.name}</div>
        <div className="text-[11px] text-foreground-muted truncate">
          על {label}: {topicScore}% · בכלל: {overallScore}% · {sample} טענות
        </div>
      </div>
      <div className="text-left shrink-0">
        <div className="font-black text-sm tabular-nums leading-none" style={{ color }}>
          {sign}{delta.toFixed(0)} נק׳
        </div>
      </div>
    </Link>
  );
}

function OtherTopicsNav({ currentSlug }: { currentSlug: string }) {
  const others = listCanonicalTopics().filter((t) => t.slug !== currentSlug);
  return (
    <section className="pt-6 border-t border-border">
      <div className="text-[11px] uppercase tracking-wider text-foreground-muted font-bold mb-3">
        עוד נושאים
      </div>
      <div className="flex flex-wrap gap-2">
        {others.map((t) => (
          <Link
            key={t.slug}
            href={`/topic/${t.slug}`}
            className="text-xs px-3 py-1.5 bg-card border border-border hover:border-foreground-muted hover:bg-muted/40 transition-colors"
            style={{ borderRadius: 2 }}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

