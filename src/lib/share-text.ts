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
 * Share text for the "ישר השבוע" hero card (top + bottom of the
 * credibility ranking).
 */
export function shareTextForHero(
  topName: string,
  topScore: number,
  bottomName: string | null,
  bottomScore: number | null,
): string {
  const top = `🏆 במקום הראשון: ${topName} · ציון אמינות ${topScore}%`;
  const bottom =
    bottomName !== null && bottomScore !== null
      ? `\n📉 במקום האחרון: ${bottomName} · ${bottomScore}%`
      : "";
  return `${top}${bottom}\n\nטבלת האמינות של פוליטיקאים ישראליים — בדוק:`;
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
    .map((it, i) => `${i + 1}. ${it.name} · ${it.score}%`);
  return `${heading}\n\n${lines.join("\n")}\n\nכל הדירוג — בדוק:`;
}
