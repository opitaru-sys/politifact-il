"use client";

import { useRouter } from "next/navigation";

interface SearchPolitician {
  id: string;
  name: string;
  /** Optional. When present, the dropdown shows "name · N טענות" so
   *  the reader can prefer data-rich picks. */
  claimCount?: number;
}

interface Props {
  politicians: SearchPolitician[];
  selectedA: string | null;
  selectedB: string | null;
}

export function CompareSelector({ politicians, selectedA, selectedB }: Props) {
  const router = useRouter();
  // Sort by claim count desc so the most-covered politicians appear at
  // the top, then alphabetically as the tiebreaker. Users who pick blind
  // tend to choose the first ~5; better that those have meaningful data.
  const sorted = [...politicians].sort((a, b) => {
    const ca = a.claimCount ?? 0;
    const cb = b.claimCount ?? 0;
    if (ca !== cb) return cb - ca;
    return a.name.localeCompare(b.name, "he");
  });

  function update(side: "a" | "b", value: string) {
    const sp = new URLSearchParams();
    const a = side === "a" ? value : selectedA;
    const b = side === "b" ? value : selectedB;
    if (a) sp.set("a", a);
    if (b) sp.set("b", b);
    const qs = sp.toString();
    router.push(qs ? `/compare?${qs}` : "/compare");
  }

  return (
    <div className="grid grid-cols-2 gap-3 mb-8">
      <Picker
        label="פוליטיקאי א"
        value={selectedA}
        onChange={(v) => update("a", v)}
        politicians={sorted}
      />
      <Picker
        label="פוליטיקאי ב"
        value={selectedB}
        onChange={(v) => update("b", v)}
        politicians={sorted}
      />
    </div>
  );
}

function Picker({
  label,
  value,
  onChange,
  politicians,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  politicians: SearchPolitician[];
}) {
  return (
    <label className="block">
      <span className="text-[10px] tracking-[0.25em] uppercase font-bold text-foreground-muted mb-1.5 block">
        {label}
      </span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-card border border-border-strong px-3 py-2 text-sm font-bold focus:outline-none focus:border-accent transition-colors cursor-pointer"
        style={{ borderRadius: 4 }}
        dir="rtl"
      >
        <option value="">בחר פוליטיקאי</option>
        {politicians.map((p) => (
          <option key={p.id} value={p.id}>
            {p.claimCount !== undefined ? `${p.name} · ${p.claimCount} טענות` : p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
