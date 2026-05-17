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
