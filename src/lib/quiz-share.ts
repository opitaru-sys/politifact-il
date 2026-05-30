/**
 * Share text for "בדוק היומי". The colored-square grid is the Wordle-style
 * viral signature — emoji live ONLY here, in the text the user posts to X /
 * WhatsApp / Telegram, never in on-site copy (the no-emoji rule is about the
 * site itself). Ported from the "Guess the Sub" shareResults.js pattern.
 */
const SHARE_URL = "https://bduk.co.il/quiz";

export function quizShareText(dayNumber: number, results: boolean[]): string {
  const score = results.filter(Boolean).length;
  const grid = results.map((ok) => (ok ? "🟩" : "🟥")).join("");
  return [
    `בדוק היומי #${dayNumber}`,
    grid,
    `ניחשתם נכון ${score} מתוך ${results.length}`,
    "מי באמת מבחין בין אמת לשקר בפוליטיקה?",
    SHARE_URL,
  ].join("\n");
}

/** Native share on mobile, clipboard fallback. */
export async function shareQuiz(
  text: string,
): Promise<"shared" | "copied" | "failed"> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ text });
      return "shared";
    } catch {
      // cancelled or unsupported — fall through to clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
