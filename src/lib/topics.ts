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
//
// The `slug` field powers the /topic/[slug] landing pages. English
// slugs are deliberate: cleaner URLs, easier sharing, Google ranks
// them better than the URL-encoded Hebrew alternative
// (/topic/%D7%91%D7%99%D7%98%D7%97%D7%95%D7%9F vs /topic/security).
// The Hebrew `label` is the human-facing display name on the page.
const NORMALIZATIONS: { match: RegExp; label: string; slug: string }[] = [
  { match: /בריאות|רפואה/i, label: "בריאות", slug: "health" },
  { match: /חינוך|לימוד/i, label: "חינוך", slug: "education" },
  { match: /ביטחון|צבא|מלחמה|מבצע/i, label: "ביטחון", slug: "security" },
  { match: /כלכלה|תקציב|מסים|אבטלה|מדד/i, label: "כלכלה", slug: "economy" },
  { match: /משפט|בג"ץ|בית.המשפט/i, label: "משפט", slug: "justice" },
  { match: /חטופים|שבוי/i, label: "חטופים", slug: "hostages" },
  { match: /התנחלויות|התנחלות|התיישבות/i, label: "התנחלויות", slug: "settlements" },
  { match: /תחבורה|רכבת/i, label: "תחבורה", slug: "transportation" },
  { match: /דיור|נדל"ן|שכר.דירה/i, label: "דיור", slug: "housing" },
  { match: /מדיני|דיפלומטיה|יחסי.חוץ/i, label: "מדיניות חוץ", slug: "foreign-policy" },
  { match: /חברה|רווחה/i, label: "חברה", slug: "society" },
  { match: /איראן/i, label: "איראן", slug: "iran" },
  { match: /משפחות.שכולות|חללים/i, label: "חללים", slug: "fallen" },
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

/**
 * Like `topicDisplayLabel` but for GROUPING — returns the canonical
 * category label if the raw topic matches a known pattern, or the
 * trimmed original otherwise. Crucially does NOT truncate, so two long
 * topics that share a prefix don't accidentally end up in the same
 * bucket after ellipsization.
 *
 * Used by the per-politician topic breakdown card so semantically
 * similar topics ("מדיניות הביטחון בגבול הצפון" + "מבצע צבאי בעזה")
 * roll up into one "ביטחון" group instead of fragmenting into single-
 * claim buckets that fail the minimum-sample threshold.
 */
export function normalizeTopic(topic: string | null | undefined): string {
  if (!topic) return "";
  const trimmed = topic.trim();
  if (!trimmed) return "";
  for (const { match, label } of NORMALIZATIONS) {
    if (match.test(trimmed)) return label;
  }
  return trimmed;
}

/** All canonical topic slugs, in display order. */
export function listCanonicalTopics(): { slug: string; label: string }[] {
  return NORMALIZATIONS.map(({ slug, label }) => ({ slug, label }));
}

/** Look up the Hebrew label for a slug, or null if the slug isn't known. */
export function slugToTopicLabel(slug: string): string | null {
  const match = NORMALIZATIONS.find((n) => n.slug === slug);
  return match ? match.label : null;
}

/** Look up the slug for a normalized Hebrew label, or null. */
export function topicLabelToSlug(label: string): string | null {
  const match = NORMALIZATIONS.find((n) => n.label === label);
  return match ? match.slug : null;
}

/**
 * Returns true if a raw (free-text) topic string maps to the canonical
 * category identified by `slug`. Used to filter claims to a topic page
 * — the DB stores raw AI-extracted topics, not normalized labels, so
 * we test the original string against the NORMALIZATIONS regex rather
 * than comparing normalized strings (which would miss edge cases where
 * normalizeTopic falls through to the trimmed original).
 */
export function rawTopicMatchesSlug(rawTopic: string | null | undefined, slug: string): boolean {
  if (!rawTopic) return false;
  const trimmed = rawTopic.trim();
  if (!trimmed) return false;
  const norm = NORMALIZATIONS.find((n) => n.slug === slug);
  if (!norm) return false;
  return norm.match.test(trimmed);
}
