import { Verdict } from "@/data/mock";

const config: Record<Verdict, { label: string; bg: string; text: string }> = {
  true: { label: "אמת", bg: "bg-green-100", text: "text-green-800" },
  "half-true": { label: "חצי אמת", bg: "bg-yellow-100", text: "text-yellow-800" },
  false: { label: "שקר", bg: "bg-red-100", text: "text-red-800" },
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const { label, bg, text } = config[verdict];
  return (
    <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${bg} ${text}`}>
      {verdict === "true" && "✅ "}
      {verdict === "half-true" && "⚠️ "}
      {verdict === "false" && "❌ "}
      {label}
    </span>
  );
}
