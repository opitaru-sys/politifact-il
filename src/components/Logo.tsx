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

  // Niqqud disambiguation: without it, Hebrew readers can read "בדוק" as
  // either "bah-DOOK" (checked/verified — what we want) or "bee-DOOK"
  // (inspection). Since we couldn't secure baduk.co.il, the URL "bduk.co.il"
  // doesn't disambiguate either. Adding the pointing makes the intent clear.
  // The kerning problem isn't uniform — only the ד→וּ gap is too tight
  // (the ד's right serif clips into the vav). Uniform letter-spacing makes
  // every gap wider, including ו→ק which then looks too loose. Instead we
  // wrap the dalet in its own span and add a targeted margin AFTER it.
  // marginInlineEnd is direction-aware: in RTL it adds space to the left
  // of the box, which visually sits between ד and וּ.
  return (
    <span
      className={`inline-flex items-baseline ${dims.gap} ${className}`}
      aria-label="בָּדוּק"
    >
      <span
        className={`${dims.text} font-black text-foreground leading-none`}
      >
        בָּ<span style={{ marginInlineEnd: "0.08em" }}>ד</span>וּק
      </span>
      <span
        aria-hidden="true"
        className={`${dims.dot} bg-accent rounded-[1px] shrink-0`}
      />
    </span>
  );
}
