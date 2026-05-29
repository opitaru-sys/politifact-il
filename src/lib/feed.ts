/**
 * Shared helpers for the public XML feeds — /feed.xml (RSS 2.0) and
 * /news.xml (Google News sitemap).
 */

export const VERDICT_LABEL_HE: Record<string, string> = {
  true: "אמת",
  "half-true": "חצי אמת",
  false: "שקר",
};

/** Escape text for inclusion in XML element content or attribute values. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Feed headline for a claim: `Name: "quote…" — verdict`. */
export function claimFeedTitle(name: string, verdict: string, quote: string): string {
  const v = VERDICT_LABEL_HE[verdict] ?? verdict;
  const q = quote.length > 90 ? quote.slice(0, 87) + "…" : quote;
  return `${name}: "${q}" — ${v}`;
}
