import type { PoliticianStatsRow } from "@/lib/queries";
import { PoliticianAvatar } from "./PoliticianAvatar";

function scoreColor(pct: number): string {
  if (pct < 40) return "var(--verdict-false)";
  if (pct < 60) return "var(--verdict-half)";
  return "var(--verdict-true)";
}

export function LeaderboardPreview({ stats }: { stats: PoliticianStatsRow[] }) {
  return (
    <div
      className="bg-card border border-border-strong overflow-hidden h-full flex flex-col"
      style={{ borderRadius: 4 }}
    >
      <div className="px-5 py-3.5 border-b border-border flex items-baseline justify-between">
        <h2 className="font-black text-base tracking-tight">טבלת האמינות</h2>
        <a
          href="/leaderboard"
          className="text-[11px] tracking-wider uppercase text-accent hover:text-accent-dark font-bold"
        >
          הכל ←
        </a>
      </div>
      <ol className="flex-1">
        {[...stats].reverse().slice(0, 8).map((stat, i) => (
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
                  style={{ color: scoreColor(stat.truthPercentage) }}
                >
                  {stat.truthPercentage}
                  <span className="text-xs">%</span>
                </div>
                <div className="text-[10px] text-foreground-muted uppercase tracking-wider mt-0.5">
                  {stat.totalClaims} טענות
                </div>
              </div>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
