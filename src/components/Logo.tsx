/**
 * Baduk wordmark — editorial typographic logo for a fact-check publication.
 * The composition borrows from press mastheads: heavy Hebrew wordmark,
 * a hairline rule beneath, and a single red press-stamp dot serving as
 * the typographic period — a quiet "checked, end of story" gesture.
 */
export function Logo({
  className = "",
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const dims = {
    sm: { text: "text-lg", dot: "w-1.5 h-1.5", gap: "gap-1" },
    md: { text: "text-2xl", dot: "w-2 h-2", gap: "gap-1.5" },
    lg: { text: "text-4xl", dot: "w-3 h-3", gap: "gap-2" },
  }[size];

  return (
    <span
      className={`inline-flex items-baseline ${dims.gap} ${className}`}
      aria-label="בדוק"
    >
      <span
        className={`${dims.text} font-black tracking-[-0.02em] text-foreground leading-none`}
      >
        בדוק
      </span>
      <span
        aria-hidden="true"
        className={`${dims.dot} bg-accent rounded-[1px] shrink-0`}
      />
    </span>
  );
}
