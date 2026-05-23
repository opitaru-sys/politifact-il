"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

interface SearchPolitician {
  id: string;
  name: string;
  party: string;
}

interface Props {
  activeTopic: string | null;
  activePolitician: string | null;
  /** Current ?window= value, passed through so changing the politician
   *  filter doesn't reset the time window. */
  activeWindow: string;
  politicians: SearchPolitician[];
}

/**
 * Filters strip below the recent-claims feed. Previously also held the
 * day-range selector (7/30/90/365), but the homepage now has a single
 * global ?window= selector at the top that controls everything below,
 * so the date chips moved there and this component shrinks to the
 * politician filter only.
 *
 * Client component because it does router.push() with useTransition
 * to show pending UI during navigation.
 */
export function FeedFilters({
  activeTopic,
  activePolitician,
  activeWindow,
  politicians,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function update(patch: { politician?: string | null; topic?: string | null }) {
    const sp = new URLSearchParams();
    const topic = patch.topic !== undefined ? patch.topic : activeTopic;
    const politician = patch.politician !== undefined ? patch.politician : activePolitician;
    if (topic) sp.set("topic", topic);
    if (politician) sp.set("politician", politician);
    if (activeWindow && activeWindow !== "30") sp.set("window", activeWindow);
    const qs = sp.toString();
    startTransition(() => {
      router.push(qs ? `/?${qs}` : "/");
    });
  }

  const sortedPoliticians = [...politicians].sort((a, b) => a.name.localeCompare(b.name, "he"));

  return (
    <div className={`flex flex-wrap items-center gap-2 text-[12px] mt-3 transition-opacity ${isPending ? "opacity-60" : ""}`}>
      <label className="flex items-center gap-1 border border-border" style={{ borderRadius: 2 }}>
        <span className="px-2 py-1 text-[10px] uppercase tracking-wider text-foreground-muted border-l border-border">
          פוליטיקאי
        </span>
        <select
          value={activePolitician ?? ""}
          onChange={(e) => update({ politician: e.target.value || null })}
          className="bg-transparent px-2 py-1 text-sm font-medium focus:outline-none cursor-pointer"
          dir="rtl"
          disabled={isPending}
        >
          <option value="">הכל</option>
          {sortedPoliticians.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {isPending && (
        <span className="text-[10px] text-foreground-muted uppercase tracking-wider animate-pulse mr-2">
          טוען...
        </span>
      )}
    </div>
  );
}
