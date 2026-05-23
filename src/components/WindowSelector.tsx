import Link from "next/link";

/**
 * Shared "rolling window" selector. Renders the same option set on the
 * homepage hero, the leaderboard page, and the politician profile so
 * a reader can compare apples to apples across pages.
 *
 * URL contract:
 *   ?window=1        -> last 24 hours
 *   ?window=7        -> last 7 days
 *   ?window=30       -> last 30 days (default — selected when param absent)
 *   ?window=60       -> last 60 days
 *   ?window=90       -> last 90 days
 *
 * "all-time" was removed: with backfilled Knesset transcripts going
 * back months, it produced misleading "X% lifetime" numbers dominated
 * by old, possibly resolved positions. Visitors get a date-bounded
 * view by design.
 *
 * `basePath` is the route to link to (e.g. "/leaderboard", "/" or
 * "/politician/abc"). Other URL params can be passed through via
 * `extraParams` so we don't lose other filters when switching the window.
 */
export const WINDOW_OPTIONS: { value: string; label: string; days: number }[] = [
  { value: "1", label: "יום", days: 1 },
  { value: "7", label: "שבוע", days: 7 },
  { value: "30", label: "חודש", days: 30 },
  { value: "60", label: "חודשיים", days: 60 },
  { value: "90", label: "3 חודשים", days: 90 },
];

/** Default = 30 days. */
export const DEFAULT_WINDOW_VALUE = "30";

export function resolveWindow(value: string | undefined | null) {
  return WINDOW_OPTIONS.find((w) => w.value === value) ??
    WINDOW_OPTIONS.find((w) => w.value === DEFAULT_WINDOW_VALUE)!;
}

export function windowLabel(value: string | undefined | null): string {
  const w = resolveWindow(value);
  if (w.days === 1) return "24 השעות האחרונות";
  return `${w.days} ימים אחרונים`;
}

export function WindowSelector({
  basePath,
  selectedValue,
  extraParams = {},
  /** Extra label rendered to the right of the chip row. Optional. */
  rightLabel,
}: {
  basePath: string;
  selectedValue: string;
  extraParams?: Record<string, string>;
  rightLabel?: string;
}) {
  function urlFor(value: string): string {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(extraParams)) {
      if (v) sp.set(k, v);
    }
    if (value !== DEFAULT_WINDOW_VALUE) sp.set("window", value);
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return (
    <div className="flex items-center gap-1 flex-wrap text-[12px]">
      <span
        className="px-2 py-1 text-[10px] uppercase tracking-wider text-foreground-muted border border-border"
        style={{ borderRadius: 2 }}
      >
        תקופה
      </span>
      {WINDOW_OPTIONS.map((w) => (
        <Link
          key={w.value}
          href={urlFor(w.value)}
          className={`px-2.5 py-1 font-medium transition-colors border ${
            w.value === selectedValue
              ? "bg-foreground text-background border-foreground"
              : "border-border text-foreground-muted hover:text-foreground hover:border-foreground-muted"
          }`}
          style={{ borderRadius: 2 }}
          aria-pressed={w.value === selectedValue}
        >
          {w.label}
        </Link>
      ))}
      {rightLabel && (
        <span className="text-[11px] text-foreground-muted uppercase tracking-wider mr-2">
          {rightLabel}
        </span>
      )}
    </div>
  );
}
