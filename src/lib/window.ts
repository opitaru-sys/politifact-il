/**
 * Stats-window utilities shared between server pages and the
 * client-side WindowSelector. Lives in /lib so server components
 * can import from here without dragging the client component's JS
 * into their bundle.
 *
 * URL contract:
 *   ?window=1        -> last 24 hours
 *   ?window=7        -> last 7 days
 *   ?window=30       -> last 30 days (default)
 *   ?window=60       -> last 60 days
 *   ?window=90       -> last 90 days
 */

export const WINDOW_OPTIONS: { value: string; label: string; days: number }[] = [
  { value: "1", label: "יום", days: 1 },
  { value: "7", label: "שבוע", days: 7 },
  { value: "30", label: "חודש", days: 30 },
  { value: "60", label: "חודשיים", days: 60 },
  { value: "90", label: "3 חודשים", days: 90 },
];

export const DEFAULT_WINDOW_VALUE = "30";

export function resolveWindow(value: string | undefined | null) {
  return (
    WINDOW_OPTIONS.find((w) => w.value === value) ??
    WINDOW_OPTIONS.find((w) => w.value === DEFAULT_WINDOW_VALUE)!
  );
}

export function windowLabel(value: string | undefined | null): string {
  const w = resolveWindow(value);
  if (w.days === 1) return "24 השעות האחרונות";
  return `${w.days} ימים אחרונים`;
}
