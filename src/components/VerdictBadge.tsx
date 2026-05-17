import { Verdict } from "@/data/mock";

const config: Record<Verdict, { label: string; bg: string; text: string; border: string }> = {
  true: {
    label: "אמת",
    bg: "bg-verdict-true-bg",
    text: "text-verdict-true",
    border: "border-verdict-true/40",
  },
  "half-true": {
    label: "חצי אמת",
    bg: "bg-verdict-half-bg",
    text: "text-verdict-half",
    border: "border-verdict-half/40",
  },
  false: {
    label: "שקר",
    bg: "bg-verdict-false-bg",
    text: "text-verdict-false",
    border: "border-verdict-false/40",
  },
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const { label, bg, text, border } = config[verdict];
  return (
    <span
      className={`inline-block px-2.5 py-1 rounded-sm border ${bg} ${text} ${border} text-xs font-bold tracking-wider uppercase`}
      style={{ letterSpacing: "0.06em" }}
    >
      {label}
    </span>
  );
}
