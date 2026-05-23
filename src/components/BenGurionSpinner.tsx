/**
 * Loading indicator: a stylized Ben Gurion doing a headstand and
 * spinning on his head. Replaces the previous understated "טוען..."
 * text because that one was nearly invisible on bright pages.
 *
 * Hand-drawn SVG (not a photograph) so it stays small in the bundle,
 * scales cleanly, and avoids licensing questions. The iconic white
 * side-hair is the bit that makes it read as Ben Gurion specifically.
 *
 * Animation: rotate around the head (transform-origin pinned to the
 * head's position in the viewBox). 1.8s per revolution — slow enough
 * for the headstand pose to register, fast enough to feel responsive.
 */
export function BenGurionSpinner({ size = 36 }: { size?: number }) {
  return (
    <span
      role="status"
      aria-label="טוען"
      className="inline-block"
      style={{
        width: size,
        height: size,
        animation: "bg-headstand-spin 1.8s linear infinite",
        // Pin the rotation centre to the head (y ≈ 100 out of 0..120 viewBox).
        transformOrigin: "50% 83%",
      }}
    >
      <svg
        viewBox="0 0 100 120"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block", width: "100%", height: "100%" }}
        aria-hidden="true"
      >
        {/* Legs kicked into the air (top of viewBox) */}
        <line x1="50" y1="50" x2="40" y2="18" stroke="#1a1a1a" strokeWidth="4.5" strokeLinecap="round" />
        <line x1="50" y1="50" x2="60" y2="18" stroke="#1a1a1a" strokeWidth="4.5" strokeLinecap="round" />
        {/* Feet flared outward — gives the figure a recognisable "fall" silhouette */}
        <line x1="40" y1="18" x2="30" y2="8" stroke="#1a1a1a" strokeWidth="4" strokeLinecap="round" />
        <line x1="60" y1="18" x2="70" y2="8" stroke="#1a1a1a" strokeWidth="4" strokeLinecap="round" />
        {/* Torso */}
        <line x1="50" y1="50" x2="50" y2="86" stroke="#1a1a1a" strokeWidth="4.5" strokeLinecap="round" />
        {/* Arms braced on the ground beside the head */}
        <line x1="50" y1="86" x2="32" y2="100" stroke="#1a1a1a" strokeWidth="4" strokeLinecap="round" />
        <line x1="50" y1="86" x2="68" y2="100" stroke="#1a1a1a" strokeWidth="4" strokeLinecap="round" />
        {/* Head (down) — skin tone with ink outline */}
        <circle cx="50" cy="100" r="14" fill="#f4d6a8" stroke="#1a1a1a" strokeWidth="2.5" />
        {/* The Ben Gurion signature: white hair tufts on either side */}
        <ellipse cx="35" cy="100" rx="8" ry="5.5" fill="#ffffff" stroke="#1a1a1a" strokeWidth="2" />
        <ellipse cx="65" cy="100" rx="8" ry="5.5" fill="#ffffff" stroke="#1a1a1a" strokeWidth="2" />
      </svg>
    </span>
  );
}
