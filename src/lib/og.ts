/**
 * Shared helpers for the per-route Open Graph share images
 * (opengraph-image.tsx in /politician, /topic, /digest). The /claim OG
 * predates this module and keeps its own inline copies; migrate it here
 * if it's ever touched again.
 *
 * RTL note: Satori (next/og) renders glyph-by-glyph left-to-right and
 * does NOT apply the Unicode bidi algorithm. `rtlHe()` reverses the whole
 * codepoint sequence so a Hebrew reader scanning right-to-left sees the
 * sentence in the correct order. Works for pure-Hebrew runs; keep Latin
 * substrings (numbers, URLs, brand names) in their OWN JSX nodes, never
 * concatenated into an rtlHe() string, or they'll read reversed.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

// Civic-press palette — mirrors the site's CSS variables so the share
// card matches what visitors see on the page.
export const NEWSPRINT = {
  bg: "#f5f1e8",
  ink: "#1a1a1a",
  muted: "#4a4a4a",
  hair: "#d9d2c0",
  accent: "#b3242a",
} as const;

// Verdict colors — same mapping as the VerdictBadge component.
export const VERDICT_OG: Record<string, { label: string; color: string }> = {
  true: { label: "אמת", color: "#16a34a" },
  "half-true": { label: "חצי אמת", color: "#ca8a04" },
  false: { label: "שקר", color: "#b3242a" },
};

/** Color a 0-100 credibility/accuracy score by band — red / amber / green. */
export function ogScoreColor(pct: number): string {
  if (pct < 40) return "#b3242a";
  if (pct < 60) return "#ca8a04";
  return "#16a34a";
}

/** Full-codepoint reverse so Satori-rendered Hebrew reads correctly RTL. */
export function rtlHe(s: string): string {
  return Array.from(s).reverse().join("");
}

/**
 * Fetch a Rubik weight (Hebrew subset) as an ArrayBuffer for next/og's
 * `fonts` option. Without a Hebrew-capable font, glyphs render as tofu.
 */
export async function loadHebrewFont(weight: 400 | 700 | 900): Promise<ArrayBuffer> {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=Rubik:wght@${weight}&display=swap&subset=hebrew`,
    { headers: { "User-Agent": "Mozilla/5.0" } },
  ).then((r) => r.text());
  const match = css.match(/src: url\((https:[^)]+\.ttf)\)/);
  if (!match) throw new Error("Could not find Rubik font URL");
  return fetch(match[1]).then((r) => r.arrayBuffer());
}
