/**
 * Shared config for the human-review queue (/admin/review).
 *
 * Lives in its own module (not in _actions.ts) because that file is
 * "use server" — those files may only export async functions, so a
 * plain constant has to live elsewhere to be importable by both the
 * server action and the page that renders the count.
 */

/**
 * Confidence at or below which a withheld claim (status="review") is
 * treated as "the automatic check had almost no idea". Claims this
 * uncertain are very rarely worth publishing — they're dominated by
 * quota-exhaustion withholds and genuinely unverifiable statements —
 * so the review page offers a one-click bulk dismiss for everything
 * at or under this bar.
 *
 * Stored as a 0-1 fraction to match the Claim.confidence column.
 * 0.30 = 30%.
 */
export const LOW_CONFIDENCE_REVIEW_THRESHOLD = 0.3;
