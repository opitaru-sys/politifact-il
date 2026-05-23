import type { PoliticianStatsRow } from "@/lib/queries";
import { MIN_CLAIMS_FOR_HERO } from "@/lib/data";
import { PoliticianAvatar } from "./PoliticianAvatar";

function scoreColor(pct: number): string {
  if (pct < 40) return "var(--verdict-false)";
  if (pct < 60) return "var(--verdict-half)";
  return "var(--verdict-true)";
}

export function LiarOfTheWeek({
  stats,
  windowDays,
}: {
  stats: PoliticianStatsRow[];
  /** Days in the rolling window. Used in the sample disclaimer so the
   *  reader sees which scope produced the 1st/last places. */
  windowDays?: number | undefined;
}) {
  // For the hero spots, only consider politicians with enough claims for a meaningful ranking.
  const qualified = stats.filter((s) => s.totalClaims >= MIN_CLAIMS_FOR_HERO);
  if (qualified.length === 0) return null;

  const top = qualified[qualified.length - 1];
  const bottom = qualified[0];
  const qualifiedCount = qualified.length;
  const showBottom = bottom.politician.id !== top.politician.id;
  // "Small pool" caveat — three politicians is not a definitive ranking.
  const smallPool = qualifiedCount < 5;
  const windowText =
    windowDays === 1
      ? "24 השעות האחרונות"
      : `${windowDays ?? 30} הימים האחרונים`;

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Primary card. Frames the leader as "1st place out of N", not "the most credible". */}
      <a
        href={`/politician/${top.politician.id}`}
        className="group relative bg-card border border-border-strong p-6 flex-1 overflow-hidden hover:bg-muted/40 transition-colors block"
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

        {/* Politician identity */}
        <div className="flex items-center gap-4 mb-5">
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
        </div>

        {/* Score + verdict breakdown on one row — reader sees the math at a glance */}
        <div className="flex items-end justify-between gap-4 border-t border-border pt-5">
          <div>
            <div
              className="text-5xl font-black leading-none tracking-tight tabular-nums"
              style={{ color: scoreColor(top.truthPercentage) }}
            >
              {top.truthPercentage}
              <span className="text-2xl">%</span>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-foreground-muted mt-2">
              אמינות · מתוך {top.totalClaims} טענות
            </div>
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

        <div className="mt-5 text-[11px] text-foreground-muted group-hover:text-accent transition-colors">
          קרא את כל הטענות של {top.politician.name} ←
        </div>
      </a>

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
            </div>
          </div>
          <div
            className="font-black text-2xl shrink-0 tabular-nums"
            style={{ color: scoreColor(bottom.truthPercentage) }}
          >
            {bottom.truthPercentage}
            <span className="text-sm">%</span>
          </div>
        </a>
      )}
    </div>
  );
}
