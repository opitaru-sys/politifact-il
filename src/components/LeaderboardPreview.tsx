import type { PoliticianStatsRow } from "@/lib/queries";
import { PoliticianAvatar } from "./PoliticianAvatar";

function scoreColor(pct: number): string {
  if (pct < 40) return "var(--verdict-false)";
  if (pct < 60) return "var(--verdict-half)";
  return "var(--verdict-true)";
}

// Below this many claims, treat the score as preliminary and mute the visual
// confidence. Matches MIN_CLAIMS_FOR_HERO in lib/data.ts.
const LOW_SAMPLE_THRESHOLD = 5;

export function LeaderboardPreview({
  stats,
  windowDays,
}: {
  stats: PoliticianStatsRow[];
  /** Days in the rolling window; undefined = all-time. Used for the
   *  caption below the title so reader knows what scope the numbers
   *  reflect. */
  windowDays?: number | undefined;
}) {
  // Politicians with enough data to be ranked confidently. Lower-sample
  // entries still appear but get a less definitive treatment.
  const sorted = [...stats].reverse(); // most credible first
  const caption = windowDays === 1
    ? "24 השעות האחרונות"
    : `${windowDays ?? 30} ימים אחרונים`;
  const leaderboardLink = windowDays === 30 || windowDays === undefined
    ? "/leaderboard"
    : `/leaderboard?window=${windowDays}`;

  return (
    <div
      className="bg-card border border-border-strong overflow-hidden h-full flex flex-col"
      style={{ borderRadius: 4 }}
    >
      <div className="px-5 py-3.5 border-b border-border flex items-baseline justify-between">
        <div>
          <h2 className="font-black text-base tracking-tight">טבלת האמינות</h2>
          <div className="text-[10px] uppercase tracking-wider text-foreground-muted mt-0.5">
            {caption}
          </div>
        </div>
        <a
          href={leaderboardLink}
          className="text-[11px] tracking-wider uppercase text-accent hover:text-accent-dark font-bold"
        >
          הכל ←
        </a>
      </div>
      <ol className="flex-1">
        {sorted.slice(0, 8).map((stat, i) => {
          const lowSample = stat.totalClaims < LOW_SAMPLE_THRESHOLD;
          return (
            <li key={stat.politician.id} className="border-b border-border last:border-b-0">
              <a
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
                    style={{
                      color: scoreColor(stat.truthPercentage),
                      // Mute the score visually when the sample is small —
                      // the reader still sees the number, but it's clearly
                      // marked as preliminary by the opacity + label below.
                      opacity: lowSample ? 0.55 : 1,
                    }}
                  >
                    {stat.truthPercentage}
                    <span className="text-xs">%</span>
                  </div>
                  <div className={`text-[10px] uppercase tracking-wider mt-0.5 ${lowSample ? "text-foreground-muted/70 italic" : "text-foreground-muted"}`}>
                    {lowSample
                      ? `מדגם קטן · ${stat.totalClaims}`
                      : `${stat.totalClaims} טענות`}
                  </div>
                </div>
              </a>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
