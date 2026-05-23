"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { WINDOW_OPTIONS, DEFAULT_WINDOW_VALUE } from "@/lib/window";
import { BenGurionSpinner } from "./BenGurionSpinner";

/**
 * Shared "rolling window" selector chips. Wraps router.push() in
 * useTransition() so we get a visible pending state (opacity + "טוען")
 * while the new server-rendered page is being built — otherwise the
 * site looks frozen for ~1-2 seconds on dynamic pages.
 *
 * Used identically on the home page, leaderboard, and politician
 * profile so visitors compare apples to apples across pages. Window
 * options + helpers live in @/lib/window so server components can
 * read them without pulling this client component into their bundle.
 */
export function WindowSelector({
  basePath,
  selectedValue,
  extraParams = {},
  rightLabel,
}: {
  basePath: string;
  selectedValue: string;
  extraParams?: Record<string, string>;
  rightLabel?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function urlFor(value: string): string {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(extraParams)) {
      if (v) sp.set(k, v);
    }
    if (value !== DEFAULT_WINDOW_VALUE) sp.set("window", value);
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  function handleSelect(value: string) {
    if (value === selectedValue) return;
    startTransition(() => {
      router.push(urlFor(value));
    });
  }

  return (
    <div
      className={`flex items-center gap-1 flex-wrap text-[12px] transition-opacity ${isPending ? "opacity-60" : ""}`}
    >
      <span
        className="px-2 py-1 text-[10px] uppercase tracking-wider text-foreground-muted border border-border"
        style={{ borderRadius: 2 }}
      >
        תקופה
      </span>
      {WINDOW_OPTIONS.map((w) => {
        const isActive = w.value === selectedValue;
        return (
          <button
            key={w.value}
            type="button"
            onClick={() => handleSelect(w.value)}
            disabled={isPending}
            className={`px-2.5 py-1 font-medium transition-colors border ${
              isActive
                ? "bg-foreground text-background border-foreground"
                : "border-border text-foreground-muted hover:text-foreground hover:border-foreground-muted"
            } ${isPending && !isActive ? "cursor-wait" : ""}`}
            style={{ borderRadius: 2 }}
            aria-pressed={isActive}
          >
            {w.label}
          </button>
        );
      })}
      {isPending && (
        <span className="inline-flex items-center gap-2 mr-2" title="טוען...">
          <BenGurionSpinner size={34} />
          <span className="text-[10px] text-foreground-muted uppercase tracking-wider">
            טוען...
          </span>
        </span>
      )}
      {!isPending && rightLabel && (
        <span className="text-[11px] text-foreground-muted uppercase tracking-wider mr-2">
          {rightLabel}
        </span>
      )}
    </div>
  );
}
