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

/**
 * Reorder a SINGLE line of Hebrew for Satori (which lays out glyphs in
 * logical order and applies no Unicode bidi). We reverse the order of
 * "runs" but keep digit/Latin runs internally left-to-right — so numbers
 * like "60" or "2026" don't come out as "06" / "6202". A naive full-string
 * reverse (the old behavior) flipped them.
 */
export function rtlHe(s: string): string {
  const tokens = s.match(/[0-9A-Za-z]+|[^0-9A-Za-z]+/g);
  if (!tokens) return s;
  let out = "";
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    out += /^[0-9A-Za-z]+$/.test(t) ? t : Array.from(t).reverse().join("");
  }
  return out;
}

/**
 * Word-wrap Hebrew into display lines for Satori. Wrap in LOGICAL order
 * first, then reorder each line with rtlHe — so line order stays correct
 * (first line on top) and each line reads right-to-left. Render the result
 * as STACKED divs, one per line. Letting Satori wrap a single fully-reversed
 * string instead is what scrambles the line order.
 */
export function wrapRtl(s: string, maxChars: number): string[] {
  const words = s.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && cur.length + 1 + w.length > maxChars) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) lines.push(cur);
  return lines.map((l) => rtlHe(l));
}

// Module-level cache so repeated OG image requests within the same
// function instance don't each re-fetch from Google Fonts (2 round-trips
// per weight). The cache persists for the lifetime of the edge function
// instance, typically several minutes of idle before eviction.
const fontCache = new Map<number, ArrayBuffer>();

/**
 * Fetch a Rubik weight (Hebrew subset) as an ArrayBuffer for next/og's
 * `fonts` option. Without a Hebrew-capable font, glyphs render as tofu.
 * Results are cached in-process to avoid repeated Google Fonts fetches.
 */
export async function loadHebrewFont(weight: 400 | 700 | 900): Promise<ArrayBuffer> {
  const cached = fontCache.get(weight);
  if (cached) return cached;

  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=Rubik:wght@${weight}&display=swap&subset=hebrew`,
    { headers: { "User-Agent": "Mozilla/5.0" } },
  ).then((r) => r.text());
  const match = css.match(/src: url\((https:[^)]+\.ttf)\)/);
  if (!match) throw new Error("Could not find Rubik font URL");
  const buffer = await fetch(match[1]).then((r) => r.arrayBuffer());
  fontCache.set(weight, buffer);
  return buffer;
}
