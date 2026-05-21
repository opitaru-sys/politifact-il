/**
 * Topic display helpers.
 *
 * AI-extracted topics arrive in free-form Hebrew, sometimes as a full
 * sentence ("מדיניות הביטחון בגבול הצפון לאחר מלחמת לבנון"). That's fine
 * for the underlying classification but makes cards / filter chips noisy.
 *
 * The URL value never changes (we filter `?topic=<original>` end-to-end),
 * so SEO and existing share links stay intact. Only the *displayed* label
 * is shortened.
 */

const MAX_DISPLAY_CHARS = 18;

// Mappings from common long-form AI outputs to canonical short labels.
// Add new entries as patterns surface in the dataset; matching is
// substring + case-insensitive.
const NORMALIZATIONS: { match: RegExp; label: string }[] = [
  { match: /בריאות|רפואה/i, label: "בריאות" },
  { match: /חינוך|לימוד/i, label: "חינוך" },
  { match: /ביטחון|צבא|מלחמה|מבצע/i, label: "ביטחון" },
  { match: /כלכלה|תקציב|מסים|אבטלה|מדד/i, label: "כלכלה" },
  { match: /משפט|בג"ץ|בית.המשפט/i, label: "משפט" },
  { match: /חטופים|שבוי/i, label: "חטופים" },
  { match: /התנחלויות|התנחלות|התיישבות/i, label: "התנחלויות" },
  { match: /תחבורה|רכבת/i, label: "תחבורה" },
  { match: /דיור|נדל"ן|שכר.דירה/i, label: "דיור" },
  { match: /מדיני|דיפלומטיה|יחסי.חוץ/i, label: "מדיניות חוץ" },
  { match: /חברה|רווחה/i, label: "חברה" },
  { match: /איראן/i, label: "איראן" },
  { match: /משפחות.שכולות|חללים/i, label: "חללים" },
];

/**
 * Returns a short, card-safe display label for a topic.
 *  - Empty / very short topics → returned as-is.
 *  - Topics matching a known category → canonical short label.
 *  - Long topics → first phrase before a comma/dash, then truncated.
 */
export function topicDisplayLabel(topic: string | null | undefined): string {
  if (!topic) return "";
  const trimmed = topic.trim();
  if (!trimmed) return "";
  if (trimmed.length <= MAX_DISPLAY_CHARS) return trimmed;

  for (const { match, label } of NORMALIZATIONS) {
    if (match.test(trimmed)) return label;
  }

  // Fall back: take the first phrase before a separator, then ellipsize.
  const firstPhrase = trimmed.split(/[,—–\-:•]/)[0].trim();
  const candidate = firstPhrase.length > 0 ? firstPhrase : trimmed;
  if (candidate.length <= MAX_DISPLAY_CHARS) return candidate;
  return candidate.slice(0, MAX_DISPLAY_CHARS - 1).trim() + "…";
}
