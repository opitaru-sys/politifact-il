"use client";

import { useRouter } from "next/navigation";

interface SearchPolitician {
  id: string;
  name: string;
}

interface Props {
  politicians: SearchPolitician[];
  selectedA: string | null;
  selectedB: string | null;
}

export function CompareSelector({ politicians, selectedA, selectedB }: Props) {
  const router = useRouter();
  const sorted = [...politicians].sort((a, b) => a.name.localeCompare(b.name, "he"));

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
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
