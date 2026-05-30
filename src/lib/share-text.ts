/**
 * Server-safe formatter for share text. Lives outside the client component
 * so it can be called from React Server Components.
 */

const VERDICT_EMOJI: Record<string, string> = {
  true: "✅",
  "half-true": "⚠️",
  false: "❌",
};

const VERDICT_HEBREW: Record<string, string> = {
  true: "אמת",
  "half-true": "חצי-אמת",
  false: "שקר",
};

export function shareTextForClaim(
  politicianName: string,
  verdict: string,
  quote: string,
): string {
  const emoji = VERDICT_EMOJI[verdict] || "";
  const verdictHebrew = VERDICT_HEBREW[verdict] || verdict;
  const shortQuote = quote.length > 120 ? quote.substring(0, 117) + "..." : quote;
  return `${emoji} ${politicianName}: "${shortQuote}"\nפסק דין: ${verdictHebrew}`;
}

/**
 * Share text for the weekly hero card — the worst offender (most misleading)
 * up top, the cleanest record as the contrast.
 */
export function shareTextForHero(
  topName: string,
  topScore: number,
  bottomName: string | null,
  bottomScore: number | null,
): string {
  const top = `המטעה המוביל: ${topName} · ${topScore} נקודות הטעיה`;
  const bottom =
    bottomName !== null && bottomScore !== null
      ? `\nהכי מדויק: ${bottomName} · ${bottomScore} נקודות`
      : "";
  return `${top}${bottom}\n\nמי מטעה את הציבור הכי הרבה. בדוק:`;
}

/**
 * Share text for a top-N ranking snippet (leaderboard / parties /
 * in-headlines strip).
 */
export function shareTextForRanking(
  heading: string,
  items: { name: string; score: number }[],
  limit: number = 5,
): string {
  const lines = items
    .slice(0, limit)
    .map((it, i) => `${i + 1}. ${it.name} · ${it.score}`);
  return `${heading}\n\n${lines.join("\n")}\n\nכל הדירוג. בדוק:`;
}

/**
 * Share text for a weekly digest issue. Lead with the date eyebrow +
 * issue title, then 3 insight headings as bullets so the recipient
 * sees the story shape, not just a link.
 *
 * Politician-name markers ({{P:id|Name}}) are stripped from headings
 * so the share text is plain Hebrew, not raw markup.
 */
export function shareTextForDigest(
  dateLabel: string,
  title: string,
  insightHeadings: string[],
  limit: number = 3,
): string {
  const cleanTitle = stripPoliticianMarkers(title);
  const bullets = insightHeadings
    .slice(0, limit)
    .map((h) => `• ${stripPoliticianMarkers(h)}`);
  return `תובנות השבוע · ${dateLabel}\n${cleanTitle}\n\n${bullets.join("\n")}\n\nהסיכום המלא:`;
}

function stripPoliticianMarkers(s: string): string {
  return s.replace(/\{\{P:[^|}]+\|([^}]+)\}\}/g, "$1");
}
