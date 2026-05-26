/**
 * "מי בכותרות" — horizontal strip of politicians sorted by raw claim
 * count in the active window. Lives between the parties preview and
 * the recent-claims feed.
 *
 * Why this exists: the credibility-ranked leaderboard is methodologically
 * correct but boring for first-time visitors who scroll looking for
 * Bibi / Lapid / Smotrich / Bennett and find Vladimir Beliak instead.
 * This strip surfaces whoever has been making the most news (= most
 * fact-check material) in the active period. Famous politicians
 * naturally dominate because they generate more coverage. Their
 * credibility score travels with them as a small color chip so the
 * methodology is still visible in context.
 *
 * Editorially defensible: the sort is pure claim count, no curation.
 */
import Link from "next/link";
import type { PoliticianStatsRow } from "@/lib/queries";
import { PoliticianAvatar } from "./PoliticianAvatar";
import { ShareButtons } from "./ShareButtons";
import { shareTextForRanking } from "@/lib/share-text";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://bduk.co.il";

function scoreColor(pct: number): string {
  if (pct < 40) return "var(--verdict-false)";
  if (pct < 60) return "var(--verdict-half)";
  return "var(--verdict-true)";
}

export function InHeadlinesStrip({
  stats,
  windowDays,
}: {
  stats: PoliticianStatsRow[];
  windowDays?: number | undefined;
}) {
  if (stats.length === 0) return null;

  const caption =
    windowDays === 1 ? "24 השעות האחרונות" : `${windowDays ?? 30} ימים אחרונים`;

  return (
    <section
      className="bg-card border border-border-strong overflow-hidden"
      style={{ borderRadius: 4 }}
    >
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-base tracking-tight">מי בכותרות</h2>
          <div className="text-[10px] uppercase tracking-wider text-foreground-muted mt-0.5">
            {caption} · מי דובר/מצוטט הכי הרבה
          </div>
        </div>
        <ShareButtons
          text={shareTextForRanking(
            `מי בכותרות · ${caption}`,
            stats.slice(0, 5).map((s) => ({ name: s.politician.name, score: s.credibilityScore })),
            5,
          )}
          url={SITE_URL}
        />
      </div>
      {/* Grid on desktop, horizontal scroll on mobile so 8 faces always fit. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-0 divide-x divide-y divide-border [&>*]:border-l [&>*]:border-b [&>*]:border-border">
        {stats.map((stat) => (
          <Link
            key={stat.politician.id}
            href={`/politician/${stat.politician.id}`}
            className="group flex flex-col items-center text-center px-3 py-4 hover:bg-muted/40 transition-colors"
            title={`${stat.politician.name} (${stat.politician.party}) · ${stat.totalClaims} טענות · ציון אמינות ${stat.credibilityScore}%`}
          >
            <PoliticianAvatar
              id={stat.politician.id}
              name={stat.politician.name}
              image={stat.politician.image}
              size="md"
            />
            <div className="font-bold text-xs mt-2 truncate w-full leading-tight">
              {stat.politician.name}
            </div>
            <div className="text-[10px] text-foreground-muted truncate w-full mt-0.5 leading-tight">
              {stat.politician.party}
            </div>
            <div className="mt-2 flex items-baseline gap-1.5 tabular-nums">
              <span
                className="text-sm font-black leading-none"
                style={{ color: scoreColor(stat.credibilityScore) }}
              >
                {stat.credibilityScore}
                <span className="text-[10px]">%</span>
              </span>
              <span className="text-[9px] text-foreground-muted/70">
                {stat.totalClaims} טענות
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
