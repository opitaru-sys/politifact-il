import Link from "next/link";
import type { PoliticianStatsRow } from "@/lib/queries";
import type { ActivitySnapshot } from "@/lib/data";
import { MIN_CLAIMS_FOR_HERO } from "@/lib/data";
import { getPoliticianTimeline, type TimelinePoint } from "@/lib/cred-history";
import { PoliticianAvatar } from "./PoliticianAvatar";
import { ShareButtons } from "./ShareButtons";
import { shareTextForHero } from "@/lib/share-text";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://bduk.co.il";

function scoreColor(pct: number): string {
  if (pct < 40) return "var(--verdict-false)";
  if (pct < 60) return "var(--verdict-half)";
  return "var(--verdict-true)";
}

/**
 * Tiny inline trend chart for the hero card. Renders nothing if there
 * aren't at least 3 usable points — a one-segment line is misleading
 * (it looks like a story when it's actually two data points).
 *
 * Min sample 5 per point matches the chart on /politician/[id] —
 * weeks where the politician had <5 claims become gaps so we don't
 * draw through them.
 */
function TrendSparkline({ points }: { points: TimelinePoint[] }) {
  const usable = points.filter((p) => p.totalClaims >= 5);
  if (usable.length < 3) return null;

  const W = 100;
  const H = 28;
  const PAD_Y = 2;
  const minTime = usable[0].asOf.getTime();
  const maxTime = usable[usable.length - 1].asOf.getTime();
  const span = maxTime - minTime || 1;

  // RTL: oldest right, newest left.
  const xFor = (t: number) => W - ((t - minTime) / span) * W;
  const yFor = (score: number) => PAD_Y + (1 - score / 100) * (H - 2 * PAD_Y);

  const d = usable
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(p.asOf.getTime()).toFixed(2)} ${yFor(p.credibilityScore).toFixed(2)}`)
    .join(" ");

  const last = usable[usable.length - 1];
  const endX = xFor(last.asOf.getTime());
  const endY = yFor(last.credibilityScore);
  const endColor = scoreColor(last.credibilityScore);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-[100px] h-[28px] shrink-0" preserveAspectRatio="xMidYMid meet">
      <path d={d} fill="none" stroke="var(--foreground-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={endX} cy={endY} r="2.5" fill={endColor} stroke="var(--card)" strokeWidth="0.8" />
    </svg>
  );
}

/**
 * Returns net change over a politician's timeline, only counting
 * snapshots with enough sample. Returns null when there isn't enough
 * data to be meaningful (less than 2 usable points or 5-claim minimum
 * not met).
 */
function trendDelta(points: TimelinePoint[]): number | null {
  const usable = points.filter((p) => p.totalClaims >= 5);
  if (usable.length < 2) return null;
  return usable[usable.length - 1].credibilityScore - usable[0].credibilityScore;
}

export async function LiarOfTheWeek({
  stats,
  windowDays,
  activityMap,
}: {
  stats: PoliticianStatsRow[];
  /** Days in the rolling window. Used in the sample disclaimer so the
   *  reader sees which scope produced the 1st/last places. */
  windowDays?: number | undefined;
  /** When provided, top + bottom cards show a small "נוכחות N%"
   *  chip — the plenum participation % from KnessetActivity. Same
   *  metric the leaderboard table and politician card surface. */
  activityMap?: Map<string, ActivitySnapshot>;
}) {
  // For the hero spots, only consider politicians with enough claims for a meaningful ranking.
  const qualified = stats.filter((s) => s.totalClaims >= MIN_CLAIMS_FOR_HERO);
  if (qualified.length === 0) return null;

  // Pick by `credibilityScore` (Wilson lower bound) instead of raw
  // `truthPercentage`. Wilson penalizes small samples — a politician
  // with 3 true claims (raw 100%) no longer outranks one with 50 claims
  // at 80%. The "more claims wins" tiebreaker we used to apply manually
  // is now intrinsic to the metric — Wilson lower bound increases with
  // sample size at constant rate, so ties basically don't exist.
  const top = qualified.reduce((best, q) =>
    q.credibilityScore > best.credibilityScore ? q : best,
  );
  const bottom = qualified.reduce((best, q) =>
    q.credibilityScore < best.credibilityScore ? q : best,
  );
  const qualifiedCount = qualified.length;
  const showBottom = bottom.politician.id !== top.politician.id;
  // "Small pool" caveat — three politicians is not a definitive ranking.
  const smallPool = qualifiedCount < 5;
  const windowText =
    windowDays === 1
      ? "24 השעות האחרונות"
      : `${windowDays ?? 30} הימים האחרונים`;

  const topActivity = activityMap?.get(top.politician.id);
  const bottomActivity = activityMap?.get(bottom.politician.id);

  // 30-day credibility timeline for the trend band. One snapshot row
  // per politician per day, so this is a couple of dozen tiny rows max
  // each. Fetched in parallel with the bottom-card timeline to keep
  // the hero on a single round-trip's worth of latency.
  const [topTimeline, bottomTimeline] = await Promise.all([
    getPoliticianTimeline(top.politician.id, 1),
    showBottom ? getPoliticianTimeline(bottom.politician.id, 1) : Promise.resolve([] as TimelinePoint[]),
  ]);
  const topDelta = trendDelta(topTimeline);
  const bottomDelta = trendDelta(bottomTimeline);

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Primary card. Frames the leader as "1st place out of N", not
          "the most credible". Outer wrapper is a <div> (not <a>) so we
          can nest the ShareButtons + politician-link in a footer
          without invalid-HTML nested-interactive elements. */}
      <div
        className="relative bg-card border border-border-strong p-6 flex-1 overflow-hidden"
        style={{ borderRadius: 4 }}
      >
        {/* Eyebrow: position, not superlative */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-accent">
            במקום הראשון
          </span>
          <span className="text-[10px] tracking-widest text-foreground-muted uppercase tabular-nums">
            1 / {qualifiedCount}
          </span>
        </div>

        {/* Sample disclaimer — promoted to top, not buried */}
        <div className="text-[11px] text-foreground-muted leading-snug mb-5 pb-4 border-b border-border">
          מבוסס על {qualifiedCount} פוליטיקאים שעמדו בסף של {MIN_CLAIMS_FOR_HERO}+ טענות שנבדקו ב-{windowText}{smallPool ? "." : "."}
          {smallPool && <span className="text-foreground-muted/80"> מדגם קטן.</span>}
        </div>

        {/* Politician identity — entire row clickable to profile */}
        <Link
          href={`/politician/${top.politician.id}`}
          className="flex items-center gap-4 mb-5 hover:opacity-80 transition-opacity"
        >
          <PoliticianAvatar
            id={top.politician.id}
            name={top.politician.name}
            image={top.politician.image}
            size="lg"
          />
          <div className="min-w-0">
            <div className="text-2xl font-black leading-tight tracking-tight">
              {top.politician.name}
            </div>
            <div className="text-sm text-foreground-muted mt-0.5">
              {top.politician.party}
            </div>
          </div>
        </Link>

        {/* Score + verdict breakdown on one row — reader sees the math at a glance */}
        <div className="flex items-end justify-between gap-4 border-t border-border pt-5">
          <div>
            <div
              className="text-5xl font-black leading-none tracking-tight tabular-nums"
              style={{ color: scoreColor(top.credibilityScore) }}
              title={`ציון מתוקנן לגודל מדגם. אחוז האמת הגולמי: ${top.truthPercentage}% מתוך ${top.totalClaims} טענות.`}
            >
              {top.credibilityScore}
              <span className="text-2xl">%</span>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-foreground-muted mt-2">
              ציון דיוק עובדתי · מתוקנן לגודל מדגם
            </div>
            <div className="text-[10px] tracking-wider text-foreground-muted/80 mt-0.5 tabular-nums">
              {top.truthPercentage}% אמת מתוך {top.totalClaims} טענות
            </div>
            {topActivity && (
              <div
                className="text-[10px] uppercase tracking-wider text-foreground-muted mt-1 tabular-nums"
                title={`דיבר ב-${topActivity.plenumSessionsSpoken} מתוך ${topActivity.plenumSessionsTotal} ישיבות מליאה ב-90 הימים האחרונים`}
              >
                נוכחות · {Math.round(topActivity.plenumParticipationPct)}%
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1 text-[11px] font-bold tabular-nums shrink-0">
            <span
              className="px-2 py-1 flex items-center justify-between gap-3 min-w-[5.5rem]"
              style={{
                backgroundColor: "var(--verdict-true-bg)",
                color: "var(--verdict-true)",
                borderRadius: 2,
              }}
            >
              <span className="opacity-80">אמת</span>
              <span>{top.trueClaims}</span>
            </span>
            <span
              className="px-2 py-1 flex items-center justify-between gap-3 min-w-[5.5rem]"
              style={{
                backgroundColor: "var(--verdict-half-bg)",
                color: "var(--verdict-half)",
                borderRadius: 2,
              }}
            >
              <span className="opacity-80">חצי</span>
              <span>{top.halfTrueClaims}</span>
            </span>
            <span
              className="px-2 py-1 flex items-center justify-between gap-3 min-w-[5.5rem]"
              style={{
                backgroundColor: "var(--verdict-false-bg)",
                color: "var(--verdict-false)",
                borderRadius: 2,
              }}
            >
              <span className="opacity-80">שקר</span>
              <span>{top.falseClaims}</span>
            </span>
          </div>
        </div>

        {/* Trend band — fills the white space below the score/verdict
            row with the time dimension. Self-hides if there aren't
            enough usable snapshots to be meaningful. Same flat
            threshold (±2 points) as the full timeline chart. */}
        {topDelta !== null && (
          <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <TrendSparkline points={topTimeline} />
              <div className="text-[11px] leading-tight">
                <div className="text-[10px] uppercase tracking-wider text-foreground-muted">
                  מגמה · 30 ימים
                </div>
                <div
                  className="font-black tabular-nums text-sm mt-0.5"
                  style={{
                    color:
                      Math.abs(topDelta) <= 2
                        ? "var(--foreground-muted)"
                        : topDelta > 0
                        ? "var(--verdict-true)"
                        : "var(--verdict-false)",
                  }}
                >
                  {topDelta > 0 ? "↑ +" : topDelta < 0 ? "↓ " : ""}
                  {topDelta.toFixed(1)}
                  <span className="text-[10px] font-medium opacity-70 mr-1">נקודות</span>
                </div>
              </div>
            </div>
            <div className="text-[10px] text-foreground-muted/70 leading-tight text-left max-w-[140px]">
              {Math.abs(topDelta) <= 2
                ? "יציבות בדיוק"
                : topDelta > 0
                ? "שיפור בדיוק בחודש האחרון"
                : "ירידה בדיוק בחודש האחרון"}
            </div>
          </div>
        )}

        {/* Footer: explicit profile link + ShareButtons. Now that the
            outer wrapper is a <div>, both interactive elements can sit
            side-by-side without nested-anchor weirdness. */}
        <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-3">
          <Link
            href={`/politician/${top.politician.id}`}
            className="text-[11px] text-foreground-muted hover:text-accent transition-colors font-bold"
          >
            קרא את כל הטענות של {top.politician.name} ←
          </Link>
          <ShareButtons
            text={shareTextForHero(
              top.politician.name,
              top.credibilityScore,
              showBottom ? bottom.politician.name : null,
              showBottom ? bottom.credibilityScore : null,
            )}
            url={SITE_URL}
          />
        </div>
      </div>

      {/* Secondary card — "last place", neutral framing. Hide if no gap. */}
      {showBottom && (
        <a
          href={`/politician/${bottom.politician.id}`}
          className="bg-card border border-border px-4 py-3 flex items-center gap-3 hover:bg-muted/40 transition-colors"
          style={{ borderRadius: 4 }}
        >
          <PoliticianAvatar
            id={bottom.politician.id}
            name={bottom.politician.name}
            image={bottom.politician.image}
            size="sm"
          />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-foreground-muted">
              במקום האחרון <span className="text-foreground-muted/60 tabular-nums">· {qualifiedCount} / {qualifiedCount}</span>
            </div>
            <div className="text-sm font-bold truncate mt-0.5">
              {bottom.politician.name}
            </div>
            <div className="text-[11px] text-foreground-muted tabular-nums">
              {bottom.trueClaims} אמת · {bottom.halfTrueClaims} חצי · {bottom.falseClaims} שקר
              {bottomActivity && (
                <>
                  <span className="mx-1 opacity-40">·</span>
                  <span title={`דיבר ב-${bottomActivity.plenumSessionsSpoken} מתוך ${bottomActivity.plenumSessionsTotal} ישיבות מליאה`}>
                    נוכחות {Math.round(bottomActivity.plenumParticipationPct)}%
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="text-left shrink-0">
            <div
              className="font-black text-2xl tabular-nums leading-none"
              style={{ color: scoreColor(bottom.credibilityScore) }}
              title={`ציון מתוקנן לגודל מדגם. אחוז האמת הגולמי: ${bottom.truthPercentage}% מתוך ${bottom.totalClaims} טענות.`}
            >
              {bottom.credibilityScore}
              <span className="text-sm">%</span>
            </div>
            <div className="text-[9px] text-foreground-muted/70 tabular-nums mt-0.5">
              {bottom.truthPercentage}% אמת
            </div>
            {/* Tiny delta chip — shown only when we have enough timeline
                data to be meaningful. Matches the trend band on the
                primary card visually so the reader connects the two. */}
            {bottomDelta !== null && Math.abs(bottomDelta) > 2 && (
              <div
                className="text-[10px] font-black tabular-nums mt-1 leading-none"
                style={{
                  color: bottomDelta > 0 ? "var(--verdict-true)" : "var(--verdict-false)",
                }}
                title="שינוי ב-30 ימים"
              >
                {bottomDelta > 0 ? "↑ +" : "↓ "}
                {bottomDelta.toFixed(1)}
              </div>
            )}
          </div>
        </a>
      )}
    </div>
  );
}
