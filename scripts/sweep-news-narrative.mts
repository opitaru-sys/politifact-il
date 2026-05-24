#!/usr/bin/env tsx
/**
 * Sweep — flag approved claims that match the "news narrative" /
 * "self-referencing 3rd person" / "hyperbolic insult" patterns and
 * un-approve them. Idempotent: re-running on already-swept rows is
 * a no-op.
 *
 * Same convention as the other sweeps in this folder: sets
 * `editorApproved=false` (keeps `status=published`) so a future
 * verifier re-run can revive a claim if its quote is rewritten or
 * the heuristic is later proved wrong. We don't delete.
 *
 * Three orthogonal patterns, each on its own counter so the audit
 * log shows which class is dominating:
 *
 *  A. News narrative — quote has no quote marks, no first-person
 *     pronouns, no attribution verbs, and starts with a past-tense
 *     3rd-person action verb. e.g. "חתם על צו לפינוי..."
 *
 *  B. Self-referencing 3rd person — politician's own name appears
 *     INSIDE their quote. e.g. May Golan's "quote" being
 *     "בעקבות הסרטונים של בן גביר..." or any case where the speaker
 *     refers to themselves in 3rd person. Usually means the
 *     extractor pulled news prose and mis-attributed it.
 *
 *  C. Hyperbolic insult — quote contains opinion/insult markers
 *     ("ההזויים", "פסיכי", "מטורף", "בוגד" etc.) and lacks any
 *     fact-checkable anchor (no numbers, no specific event, no
 *     first-person action).
 *
 * Usage:
 *   npx tsx scripts/sweep-news-narrative.mts            # dry run
 *   npx tsx scripts/sweep-news-narrative.mts --apply    # actually unapproves
 */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");

/** Past-tense 3rd-person Hebrew verbs commonly used by news prose
 *  to describe a politician's actions. Used to detect Pattern A. */
const THIRD_PERSON_ACTION_VERBS = [
  "חתם", "חתמה",
  "אישר", "אישרה",
  "הודיע", "הודיעה",
  "פגש", "פגשה",
  "החליט", "החליטה",
  "הזכיר", "הזכירה",
  "הכריז", "הכריזה",
  "העביר", "העבירה",
  "קיבל", "קיבלה",
  "דחה", "דחתה",
  "הציע", "הציעה",
  "ביקש", "ביקשה",
  "הורה", "הורתה",
  "מינה", "מינתה",
  "פיטר", "פיטרה",
  "התפטר", "התפטרה",
];

/**
 * True if the quote is wrapped in quotation marks as a whole.
 * Previously we bailed out of Pattern A as soon as ANY quote-like
 * character appeared inside the quote — but Hebrew text frequently
 * has apostrophes for Arabic transliteration ("ח'אן אלאחמר") and
 * the gershayim mark inside acronyms ("ח"כ", "צה"ל"). Those should
 * NOT mean "this is a direct quote." Only a wrapping pair of double
 * quotes / gershayim around the whole string does.
 */
function isWrappedInQuotes(quote: string): boolean {
  const t = quote.trim();
  if (t.length < 2) return false;
  const first = t[0];
  const last = t[t.length - 1];
  const isQuoteMark = (c: string) => c === '"' || c === "״" || c === '"' || c === '"';
  return isQuoteMark(first) && isQuoteMark(last);
}

/** First-person markers — pronouns + 1st-person verb conjugations.
 *  If any match, this is genuinely the politician speaking, not a
 *  3rd-person news report. */
const FIRST_PERSON_RE =
  /\b(אני|אנחנו|אנו|הוצאנו|החלטתי|חתמתי|התפטרתי|הקמתי|אמרתי|אגיד|אומר|נחלץ|נטפל|נקים|נצליח|הצבעתי|התקשרתי)\b/;

/**
 * Insult / opinion-marker word list — Pattern C.
 *
 * Kept conservative: only words that ALMOST NEVER appear in a
 * legitimate fact-checkable quote. We deliberately excluded:
 *
 *   - "מטורף/ת/ים" — colloquially "extreme/skyrocketing"
 *     ("עלייה מטורפת" = "skyrocketing rise"). Legitimate stat
 *     description.
 *   - "בוגד / בוגדים / בגידה" — "בגידה" is a legal term, "בוגד בכם"
 *     is the idiom "if memory doesn't betray you." Too many benign
 *     uses.
 *   - "מבזה / בזוי / מבייש" — already on the extraction-prompt
 *     rejection list; if they slipped through, it's a 1-off and not
 *     worth sweep overhead vs. FP risk.
 *
 *  What's left are the "always-insult" terms. The user's screenshot
 *  example ("ההזויים שלו") is covered by ההזוי/ההזויים.
 */
const INSULT_WORDS = [
  "ההזוי", "ההזויה", "ההזויים", "ההזויות",
  "פסיכי", "פסיכים", "פסיכית",
  "מטומטם", "מטומטמים",
  "טיפש", "טיפשים", "טיפשה",
];

interface Claim {
  id: string;
  quote: string;
  politicianId: string;
  politicianName: string;
  verdict: string;
  editorApproved: boolean;
}

function startsWithThirdPersonAction(quote: string): string | null {
  const trimmed = quote.replace(/^["״׳'"\s]+/, "").trim();
  for (const verb of THIRD_PERSON_ACTION_VERBS) {
    // Match the verb only as a leading word, not when it appears
    // mid-sentence (which is normal Hebrew).
    if (trimmed.startsWith(verb + " ") || trimmed.startsWith(verb + ",")) {
      return verb;
    }
  }
  return null;
}

/**
 * Hebrew-aware word-boundary matcher.
 *
 * Hebrew has no \b — prefixes (ה / ב / ל / ש / מ / ו / כ) attach
 * directly. So a substring `.includes("פסיכי")` catches "פסיכיאטר"
 * (psychiatrist) and "בגידה" catches "אינו בוגד בכם" idiom.
 *
 * Approach: require the matched word to be flanked by either
 * start/end of string OR a non-letter character (whitespace,
 * punctuation, Hebrew quote marks, parens, dash). Allow a single
 * Hebrew prefix letter before. This gets us close to a real word
 * boundary in practice.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function hebrewWordMatch(haystack: string, needle: string): boolean {
  const escaped = escapeRegex(needle);
  // Boundary chars: start, whitespace, common Hebrew/Latin punctuation,
  // quote marks (both Hebrew gershayim and ASCII), parens, brackets, dash.
  const boundary = `(?:^|[\\s,.\\(\\)\\[\\]\\-:!?"״׳'])`;
  const trailBoundary = `(?:$|[\\s,.\\(\\)\\[\\]\\-:!?"״׳'])`;
  // Allow a single Hebrew one-letter prefix (ה/ב/ל/ש/מ/ו/כ) before
  // the needle for cases like "ההזוי" → match "הזוי" with ה prefix.
  // We don't need to include those prefixes here because the INSULT_WORDS
  // list already enumerates the prefixed forms ("ההזוי"). Skipping the
  // prefix tolerance to stay strict.
  const re = new RegExp(`${boundary}${escaped}${trailBoundary}`);
  return re.test(haystack);
}

function containsInsult(quote: string): string | null {
  for (const word of INSULT_WORDS) {
    if (hebrewWordMatch(quote, word)) return word;
  }
  return null;
}

/**
 * Pattern A — news narrative.
 *
 * Conditions ALL must hold:
 *   - no quote marks
 *   - no first-person markers
 *   - quote starts with a 3rd-person past-tense action verb from the list
 */
function isNewsNarrative(claim: Claim): string | null {
  if (isWrappedInQuotes(claim.quote)) return null;
  if (FIRST_PERSON_RE.test(claim.quote)) return null;
  const verb = startsWithThirdPersonAction(claim.quote);
  if (!verb) return null;
  return `pattern A (news narrative, starts with "${verb}")`;
}

/**
 * Generic Hebrew first names that are too common to safely match as
 * self-references. "דוד" (David) matches every quote that mentions any
 * person named David; "אחמד" matches any Ahmad. We rely on the
 * politician's *surname* instead, which is much more discriminating.
 */
const GENERIC_FIRST_NAMES = new Set([
  "דוד", "דויד", "משה", "יוסף", "יעקב", "אברהם", "יצחק", "שמעון",
  "בנימין", "ישראל", "אלי", "אברם", "אהרון", "אורי", "איתן", "אילן",
  "אמיר", "אריאל", "אריה", "אבי", "גיא", "דניאל", "הילל", "זאב",
  "חיים", "טל", "יאיר", "יואב", "יואל", "יונתן", "יוסי", "יורם", "ירון",
  "מאיר", "מרדכי", "מתן", "נדב", "ניר", "עומר", "עמוס", "עמיר", "פנחס",
  "צבי", "רון", "רונן", "שאול", "שלמה", "שלום", "תומר",
  // Female
  "מאי", "מיכל", "תמר", "שירה", "ענת", "אילנה", "נעמה", "רחל", "שרה",
  "אסתר", "טלי", "יעל", "מרב", "ליאת", "מירי", "אורית", "אילנית",
  // Generic transliterations
  "ולדימיר", "סרגיי", "אלכסנדר", "אנדריי",
  "אחמד", "מוחמד", "עלי", "איימן", "וליד",
]);

/**
 * Pattern B — self-referencing 3rd person.
 *
 * The politician's own name appears inside their "quote." Strongest
 * signal that the extractor mis-attributed news prose. Two tightenings
 * vs the v1 of this check:
 *
 *  1. Only the politician's *surname* (the last token of their full
 *     name) is checked. First names are too common — "דוד" or "אחמד"
 *     would false-positive on every quote mentioning any David or
 *     Ahmad in the news.
 *  2. Hebrew word-boundary match, not substring — so "שיקלי" no
 *     longer matches "קיש" mid-word, etc.
 *
 *  Surname is also dropped if it's <= 3 chars or in the generic-name
 *  blocklist (catches e.g. "סון" of "סון הר מלך" — single short
 *  syllable, ambiguous).
 */
function isSelfReferencing(claim: Claim): string | null {
  const tokens = claim.politicianName.trim().split(/\s+/);
  const surname = tokens[tokens.length - 1];
  if (!surname || surname.length <= 3) return null;
  if (GENERIC_FIRST_NAMES.has(surname)) return null;
  if (hebrewWordMatch(claim.quote, surname)) {
    return `pattern B (self-references surname "${surname}" in 3rd person)`;
  }
  return null;
}

/**
 * Pattern C — hyperbolic insult.
 *
 * Insult word is present AND there's no fact-checkable anchor:
 *   - no multi-digit number (no statistic)
 *   - no first-person action verb
 *   - no attribution verb pointing to a specific event
 *
 * Conservative: we'd rather miss a few than over-flag legitimate
 * criticism that happens to contain one of these words.
 */
function isHyperbolicInsult(claim: Claim): string | null {
  const insult = containsInsult(claim.quote);
  if (!insult) return null;
  const hasNumber = /\d{2,}/.test(claim.quote);
  const hasFirstPersonAction = FIRST_PERSON_RE.test(claim.quote);
  // Has any factual anchor → leave alone, even if an insult word is
  // present. The fact-check pipeline can decide.
  if (hasNumber || hasFirstPersonAction) return null;
  return `pattern C (contains insult "${insult}", no factual anchor)`;
}

async function main() {
  const claims: Claim[] = await prisma.$queryRaw`
    SELECT c.id, c.quote, c."politicianId", p.name as "politicianName",
           c.verdict, c."editorApproved"
    FROM "Claim" c
    JOIN "Politician" p ON p.id = c."politicianId"
    WHERE c."editorApproved" = true AND c.status = 'published'
  `;

  console.log(`Scanning ${claims.length} approved+published claims...\n`);

  const flagged: { claim: Claim; reason: string }[] = [];
  const stats = { A: 0, B: 0, C: 0 };

  for (const claim of claims) {
    const reasonA = isNewsNarrative(claim);
    const reasonB = isSelfReferencing(claim);
    const reasonC = isHyperbolicInsult(claim);
    const reasons = [reasonA, reasonB, reasonC].filter(Boolean) as string[];
    if (reasons.length === 0) continue;

    if (reasonA) stats.A++;
    if (reasonB) stats.B++;
    if (reasonC) stats.C++;

    flagged.push({ claim, reason: reasons.join("; ") });
  }

  console.log(`Flagged: ${flagged.length}`);
  console.log(`  Pattern A (news narrative):       ${stats.A}`);
  console.log(`  Pattern B (self-referencing 3p):  ${stats.B}`);
  console.log(`  Pattern C (hyperbolic insult):    ${stats.C}`);
  console.log(`  (counters may overlap when a row hits multiple patterns)\n`);

  for (const { claim, reason } of flagged.slice(0, 40)) {
    console.log(`[${claim.politicianName} · ${claim.verdict}] ${reason}`);
    console.log(`  "${claim.quote.slice(0, 140)}"`);
    console.log();
  }
  if (flagged.length > 40) {
    console.log(`... and ${flagged.length - 40} more.`);
  }

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to actually un-approve these claims.");
  } else {
    console.log("\nApplying...");
    const result = await prisma.claim.updateMany({
      where: { id: { in: flagged.map((f) => f.claim.id) } },
      data: { editorApproved: false },
    });
    console.log(`Un-approved ${result.count} claims.`);
  }

  await prisma.$disconnect();
}

await main();
