/**
 * Topic discovery strip for the home page. Lists the top N topics by
 * claim count in the active window, each with its raw truth % colored
 * by the standard verdict palette. Links into /topic/[slug] for the
 * full analysis.
 *
 * Lives below the DigestHighlights card. Both together replace the
 * BiggestMovers slot — the home page's "what's interesting?" surface
 * shifted from movement-on-numbers to narrative + topic-discovery.
 *
 * Hides if no topics have ≥3 claims in the window (too thin to be
 * useful).
 */
import Link from "next/link";
import type { getTopTopicsForWindow } from "@/lib/topic-stats";

type TopicRow = Awaited<ReturnType<typeof getTopTopicsForWindow>>[number];

function scoreColor(pct: number): string {
  if (pct < 40) return "var(--verdict-false)";
  if (pct < 60) return "var(--verdict-half)";
  return "var(--verdict-true)";
}

export function TopicHighlights({
  topics,
  windowDays,
}: {
  topics: TopicRow[];
  windowDays?: number;
}) {
  const meaningful = topics.filter((t) => t.claimCount >= 3);
  if (meaningful.length === 0) return null;

  const caption =
    windowDays === 1 ? "24 השעות האחרונות" : `${windowDays ?? 30} ימים אחרונים`;

  return (
    <section
      className="bg-card border border-border-strong overflow-hidden"
      style={{ borderRadius: 4 }}
    >
      <div className="px-5 py-3.5 border-b border-border flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-black text-base tracking-tight">מה דיברו עליו השבוע</h2>
          <div className="text-[10px] uppercase tracking-wider text-foreground-muted mt-0.5">
            {caption} · נושאים שזכו להכי הרבה טענות
          </div>
        </div>
        <Link
          href="/topics"
          className="text-[11px] tracking-wider uppercase text-accent hover:text-accent-dark font-bold"
        >
          כל הנושאים ←
        </Link>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-border">
        {meaningful.slice(0, 5).map((t) => (
          <li key={t.slug}>
            <Link
              href={`/topic/${t.slug}`}
              className="block px-4 py-4 hover:bg-muted/40 transition-colors h-full"
            >
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="font-black text-sm tracking-tight">{t.label}</span>
                <span
                  className="font-black text-sm tabular-nums leading-none"
                  style={{ color: scoreColor(t.truthPercentage) }}
                  title={`אחוז האמת המשוקלל בנושא, ${t.claimCount} טענות`}
                >
                  {t.truthPercentage}%
                </span>
              </div>
              <div className="text-[10px] text-foreground-muted tabular-nums">
                {t.claimCount} טענות · {t.politicianCount} פוליטיקאים
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
