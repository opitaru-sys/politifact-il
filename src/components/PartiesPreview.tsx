/**
 * Home-page preview of /parties. Mirrors LeaderboardPreview in shape and
 * tone: compact list of the top-credibility parties for the active
 * window, each row a stamp-style bar that matches the full /parties
 * page below.
 *
 * Kept full-width below the hero+leaderboard duo (rather than a third
 * column) because party rows need horizontal room for the 3-color
 * verdict bar to read at a glance.
 */
import Link from "next/link";
import { ShareButtons } from "./ShareButtons";
import { shareTextForRanking } from "@/lib/share-text";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://bduk.co.il";

interface PartyStat {
  party: string;
  trueClaims: number;
  halfTrue: number;
  falseClaims: number;
  total: number;
  truthPercentage: number;
  /** Wilson 95% CI lower bound — the sample-adjusted credibility number
   *  shown as the headline and used for sorting. */
  credibilityScore: number;
}

function scoreColor(pct: number): string {
  if (pct < 40) return "var(--verdict-false)";
  if (pct < 60) return "var(--verdict-half)";
  return "var(--verdict-true)";
}

const LOW_SAMPLE_THRESHOLD = 10;

export function PartiesPreview({
  stats,
  windowDays,
  limit = 5,
}: {
  stats: PartyStat[];
  windowDays?: number | undefined;
  /** Rows to show on the preview. Default 5. */
  limit?: number;
}) {
  // Sort by credibilityScore desc — same Wilson-adjusted ranking we use
  // everywhere else on the site. A small party at "100% raw" no longer
  // outranks a larger party at lower raw % but higher confidence.
  const sorted = [...stats].sort((a, b) => b.credibilityScore - a.credibilityScore);
  const top = sorted.slice(0, limit);
  if (top.length === 0) return null;

  const caption =
    windowDays === 1 ? "24 השעות האחרונות" : `${windowDays ?? 30} ימים אחרונים`;
  const partiesLink =
    windowDays === 30 || windowDays === undefined
      ? "/parties"
      : `/parties?window=${windowDays}`;

  return (
    <div
      className="bg-card border border-border-strong overflow-hidden"
      style={{ borderRadius: 4 }}
    >
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-base tracking-tight">דירוג מפלגות</h2>
          <div className="text-[10px] uppercase tracking-wider text-foreground-muted mt-0.5">
            {caption}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <ShareButtons
            text={shareTextForRanking(
              `דירוג מפלגות · ${caption}`,
              sorted.slice(0, 5).map((s) => ({ name: s.party, score: s.credibilityScore })),
              5,
            )}
            url={`${SITE_URL}${partiesLink}`}
          />
          <Link
            href={partiesLink}
            className="text-[11px] tracking-wider uppercase text-accent hover:text-accent-dark font-bold"
          >
            הכל ←
          </Link>
        </div>
      </div>
      <ol>
        {top.map((stat, i) => {
          const lowSample = stat.total < LOW_SAMPLE_THRESHOLD;
          const falseWidth = (stat.falseClaims / stat.total) * 100;
          const halfWidth = (stat.halfTrue / stat.total) * 100;
          const trueWidth = (stat.trueClaims / stat.total) * 100;
          return (
            <li
              key={stat.party}
              className="border-b border-border last:border-b-0 px-5 py-3"
            >
              <div className="flex items-baseline justify-between mb-2 gap-3">
                <div className="flex items-baseline gap-3 min-w-0">
                  <span className="text-sm font-black text-foreground-muted tabular-nums w-5 shrink-0">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="font-bold text-sm truncate">{stat.party}</span>
                </div>
                <div
                  className="flex items-baseline gap-1.5 shrink-0"
                  title={`ציון מתוקנן לגודל מדגם. אחוז האמת הגולמי: ${stat.truthPercentage}% מתוך ${stat.total} טענות.`}
                >
                  <span
                    className="font-black text-base tabular-nums leading-none"
                    style={{
                      color: scoreColor(stat.credibilityScore),
                      opacity: lowSample ? 0.65 : 1,
                    }}
                  >
                    {stat.credibilityScore}
                    <span className="text-xs">%</span>
                  </span>
                  <span
                    className={`text-[10px] tabular-nums ${
                      lowSample ? "text-foreground-muted/70 italic" : "text-foreground-muted"
                    }`}
                  >
                    {stat.truthPercentage}% · {stat.total}
                  </span>
                </div>
              </div>

              <div
                className="h-1.5 overflow-hidden flex bg-muted"
                style={{ borderRadius: 1 }}
                title={`${stat.trueClaims} אמת · ${stat.halfTrue} חצי · ${stat.falseClaims} שקר`}
              >
                <div
                  className="h-full"
                  style={{
                    width: `${falseWidth}%`,
                    backgroundColor: "var(--verdict-false)",
                  }}
                />
                <div
                  className="h-full"
                  style={{
                    width: `${halfWidth}%`,
                    backgroundColor: "var(--verdict-half)",
                  }}
                />
                <div
                  className="h-full"
                  style={{
                    width: `${trueWidth}%`,
                    backgroundColor: "var(--verdict-true)",
                  }}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
