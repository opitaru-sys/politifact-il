import type { PoliticianStatsRow } from "@/lib/queries";
import type { ActivitySnapshot } from "@/lib/data";
import { PoliticianAvatar } from "./PoliticianAvatar";
import { ShareButtons } from "./ShareButtons";
import { shareTextForRanking } from "@/lib/share-text";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://bduk.co.il";

// Below this many claims, treat the score as preliminary and mute it visually.
const LOW_SAMPLE_THRESHOLD = 5;

export function LeaderboardPreview({
  stats,
  windowDays,
  activityMap,
}: {
  stats: PoliticianStatsRow[];
  /** Days in the rolling window; undefined = all-time. Used for the
   *  caption below the title so reader knows what scope the numbers
   *  reflect. */
  windowDays?: number | undefined;
  /** Optional. When provided, each row gets a small "השתתפות N%"
   *  line below its claim count so the home-page preview shows the
   *  same accountability dimension the full leaderboard does. */
  activityMap?: Map<string, ActivitySnapshot>;
}) {
  // Most misleading first — ranks by the weighted lie score (false×1 + half×0.5).
  const sorted = [...stats].sort(
    (a, b) => b.lieScore - a.lieScore || b.falseClaims - a.falseClaims,
  );
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
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-base tracking-tight">מי מטעה הכי הרבה</h2>
          <div className="text-[10px] uppercase tracking-wider text-foreground-muted mt-0.5">
            {caption}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <ShareButtons
            text={shareTextForRanking(
              `מי מטעה הכי הרבה · ${caption}`,
              sorted.slice(0, 5).map((s) => ({ name: s.politician.name, score: s.lieScore })),
              5,
            )}
            url={`${SITE_URL}${leaderboardLink}`}
          />
          <a
            href={leaderboardLink}
            className="text-[11px] tracking-wider uppercase text-accent hover:text-accent-dark font-bold"
          >
            הכל ←
          </a>
        </div>
      </div>
      <ol className="flex-1">
        {sorted.slice(0, 8).map((stat, i) => {
          const lowSample = stat.totalClaims < LOW_SAMPLE_THRESHOLD;
          const activity = activityMap?.get(stat.politician.id);
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
                      color: "var(--verdict-false)",
                      opacity: lowSample ? 0.65 : 1,
                    }}
                    title={`ניקוד הטעיה: ${stat.lieScore} (שקר=1, חצי=0.5). ${stat.truthPercentage}% אמת מתוך ${stat.totalClaims} טענות.`}
                  >
                    {stat.lieScore}
                  </div>
                  <div className={`text-[10px] tabular-nums mt-0.5 ${lowSample ? "text-foreground-muted/70 italic" : "text-foreground-muted"}`}>
                    {stat.truthPercentage}% אמת · {stat.totalClaims} טענות
                  </div>
                  {/* Plenum participation %, when available. Kept on
                      its own muted line so it doesn't compete with
                      the truth % visually but is still visible at a
                      glance. Only renders for MKs we have activity
                      data for (matched by NAME_TO_ID). */}
                  {activity && (
                    <div
                      className="text-[10px] tabular-nums text-foreground-muted/80 mt-0.5"
                      title={`דיבר ב-${activity.plenumSessionsSpoken} מתוך ${activity.plenumSessionsTotal} ישיבות מליאה ב-90 הימים האחרונים`}
                    >
                      {Math.round(activity.plenumParticipationPct)}% נוכחות
                    </div>
                  )}
                </div>
              </a>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
