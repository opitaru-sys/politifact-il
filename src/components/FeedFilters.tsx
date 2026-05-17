"use client";

import { useRouter } from "next/navigation";

interface SearchPolitician {
  id: string;
  name: string;
  party: string;
}

interface Props {
  activeDays: number;
  activeTopic: string | null;
  activePolitician: string | null;
  politicians: SearchPolitician[];
  dayOptions: number[];
}

const DAY_LABELS: Record<number, string> = {
  7: "שבוע",
  30: "חודש",
  90: "3 חודשים",
  365: "שנה",
};

export function FeedFilters({
  activeDays,
  activeTopic,
  activePolitician,
  politicians,
  dayOptions,
}: Props) {
  const router = useRouter();

  function update(patch: { days?: number; politician?: string | null; topic?: string | null }) {
    const sp = new URLSearchParams();
    const topic = patch.topic !== undefined ? patch.topic : activeTopic;
    const politician = patch.politician !== undefined ? patch.politician : activePolitician;
    const days = patch.days !== undefined ? patch.days : activeDays;
    if (topic) sp.set("topic", topic);
    if (politician) sp.set("politician", politician);
    if (days !== 30) sp.set("days", String(days));
    const qs = sp.toString();
    router.push(qs ? `/?${qs}` : "/");
  }

  // Sort politicians: those with results first (handled by parent), then alphabetical.
  const sortedPoliticians = [...politicians].sort((a, b) => a.name.localeCompare(b.name, "he"));

  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px]">
      {/* Date range */}
      <div className="flex items-center gap-1 border border-border" style={{ borderRadius: 2 }}>
        <span className="px-2 py-1 text-[10px] uppercase tracking-wider text-foreground-muted border-l border-border">
          תקופה
        </span>
        {dayOptions.map((d) => (
          <button
            key={d}
            onClick={() => update({ days: d })}
            className={`px-2.5 py-1 font-medium transition-colors ${
              d === activeDays
                ? "bg-foreground text-background"
                : "hover:bg-muted text-foreground-muted hover:text-foreground"
            }`}
            aria-pressed={d === activeDays}
          >
            {DAY_LABELS[d] ?? d}
          </button>
        ))}
      </div>

      {/* Politician filter */}
      <label className="flex items-center gap-1 border border-border" style={{ borderRadius: 2 }}>
        <span className="px-2 py-1 text-[10px] uppercase tracking-wider text-foreground-muted border-l border-border">
          פוליטיקאי
        </span>
        <select
          value={activePolitician ?? ""}
          onChange={(e) => update({ politician: e.target.value || null })}
          className="bg-transparent px-2 py-1 text-sm font-medium focus:outline-none cursor-pointer"
          dir="rtl"
        >
          <option value="">הכל</option>
          {sortedPoliticians.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
