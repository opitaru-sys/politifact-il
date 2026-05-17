/**
 * Baduk logo: blue check-badge + bold Hebrew wordmark "בדוק".
 * Implemented as flex HTML so the Hebrew text uses the loaded Rubik font
 * (SVG <text> with Hebrew was rendering invisibly in some browsers).
 */
export function Logo({
  className = "",
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const dims = {
    sm: { badge: "h-5 w-5 rounded-md text-xs", text: "text-base", gap: "gap-1.5" },
    md: { badge: "h-9 w-9 rounded-lg text-lg", text: "text-2xl", gap: "gap-2" },
    lg: { badge: "h-12 w-12 rounded-xl text-2xl", text: "text-4xl", gap: "gap-3" },
  }[size];

  return (
    <span className={`inline-flex items-center ${dims.gap} ${className}`}>
      <span
        className={`${dims.badge} bg-brand text-white flex items-center justify-center font-black`}
        aria-hidden="true"
      >
        ✓
      </span>
      <span className={`${dims.text} font-black tracking-tight text-foreground`}>בדוק</span>
    </span>
  );
}
