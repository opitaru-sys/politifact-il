/**
 * Deterministic claim-quality guards.
 *
 * The AI extractor is good at finding factual-looking sentences, but RSS
 * articles often describe what a politician did. Those sentences can be
 * fact-checkable in isolation, yet they are not claims made by the politician.
 * This module catches the clearest low-risk cases before they reach public UI.
 */

export interface ClaimQualityInput {
  quote: string;
  politicianName: string;
  source?: string;
}

export interface ClaimQualityIssue {
  code: "news-narrative" | "self-reference" | "opinion-insult";
  reason: string;
}

const FIRST_PERSON_RE =
  /\b(אני|אנחנו|אנו|הוצאנו|החלטתי|חתמתי|התפטרתי|הקמתי|אמרתי|אגיד|אומר|נחלץ|נטפל|נקים|נצליח|הצבעתי|התקשרתי|פעלתי|ביקשתי|דרשתי|סיכלנו|עשינו|העברנו|הקמנו)\b/;

const THIRD_PERSON_ACTION_VERBS = [
  "חתם", "חתמה", "חתום", "חתומה",
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
  "העלה", "העלתה",
  "פרסם", "פרסמה",
  "קידם", "קידמה",
  "השיק", "השיקה",
  "הפיק", "הפיקה",
  "הגיע", "הגיעה",
  "ביקר", "ביקרה",
  "סייר", "סיירה",
  "שיתף", "שיתפה",
  "הפיץ", "הפיצה",
  "פרש", "פרשה", "פורש", "פורשת",
];

const THIRD_PERSON_POSSESSIVE_STARTS = [
  "עד הגעתו", "עד הגעתה",
  "הגעתו", "הגעתה",
  "ביקורו", "ביקורה",
  "הביקור שלו", "הביקור שלה",
  "סרטוניו", "סרטוניה",
  "הסרטונים שלו", "הסרטונים שלה",
  "המהלך שלו", "המהלך שלה",
  "פעילותו", "פעילותה",
  "החלטתו", "החלטתה",
  "חתימתו", "חתימתה",
  "הגעתו המתוקשרת", "הגעתה המתוקשרת",
];

const ARTICLE_BACKGROUND_STARTS = [
  "תופעת", "פרשת", "מקרה", "אירוע", "המהלך", "התוכנית", "התכנית",
  "הביקור", "הסרטון", "הסרטונים", "המתחם", "הנזק", "העלות",
  "המאבק", "החוק", "הצעת החוק",
  "פרישתו", "פרישתה",
];

const ARTICLE_BACKGROUND_VERBS =
  /(מוגדר|מוגדרת|מוגדרים|מוערך|מוערכת|נחשב|נחשבת|פורסם|פורסמה|דווח|דווחה|נמסר|אושר|אושרה|קודם|קודמה)/;

const INSULT_WORDS = [
  "ההזוי", "ההזויה", "ההזויים", "ההזויות",
  "פסיכי", "פסיכים", "פסיכית",
  "מטומטם", "מטומטמים",
  "טיפש", "טיפשים", "טיפשה",
  "חצוף", "חצופים", "חצופה",
  "מיותר", "מיותרת", "מיותרים", "מיותרות",
  "חסר פרופורציות", "חסרת פרופורציות", "חסרי פרופורציות",
  "פרובוקטיבי", "פרובוקטיבית",
];

const GENERIC_SHORT_SURNAMES = new Set(["כהן", "לוי", "דוד"]);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isWrappedInQuotes(quote: string): boolean {
  const t = quote.trim();
  if (t.length < 2) return false;
  const first = t[0];
  const last = t[t.length - 1];
  const isQuoteMark = (c: string) => c === '"' || c === "״";
  return isQuoteMark(first) && isQuoteMark(last);
}

export function hebrewWordMatch(haystack: string, needle: string): boolean {
  const boundary = `(?:^|[\\s,.()\\[\\]\\-:!?"״׳'])`;
  const trailBoundary = `(?:$|[\\s,.()\\[\\]\\-:!?"״׳'])`;
  return new RegExp(`${boundary}${escapeRegex(needle)}${trailBoundary}`).test(haystack);
}

function startsWithThirdPersonAction(quote: string): string | null {
  const trimmed = quote.replace(/^["״׳'\s]+/, "").trim();
  for (const verb of THIRD_PERSON_ACTION_VERBS) {
    if (trimmed === verb || trimmed.startsWith(`${verb} `) || trimmed.startsWith(`${verb},`)) {
      return verb;
    }
  }
  return null;
}

function startsWithPossessiveNarrative(quote: string): string | null {
  const trimmed = quote.replace(/^["״׳'\s]+/, "").trim();
  return THIRD_PERSON_POSSESSIVE_STARTS.find((start) => trimmed.startsWith(start)) ?? null;
}

function startsWithArticleBackground(quote: string): string | null {
  const trimmed = quote.replace(/^["״׳'\s]+/, "").trim();
  const start = ARTICLE_BACKGROUND_STARTS.find((candidate) => trimmed.startsWith(candidate));
  if (!start) return null;
  const firstClause = trimmed.slice(0, 120);
  return ARTICLE_BACKGROUND_VERBS.test(firstClause) ? start : null;
}

function getDiscriminatingNameParts(politicianName: string): string[] {
  const tokens = politicianName.trim().split(/\s+/).filter(Boolean);
  const surname = tokens[tokens.length - 1];
  if (!surname || surname.length <= 3 || GENERIC_SHORT_SURNAMES.has(surname)) return [];
  return [surname];
}

function selfReferencesPolitician(input: ClaimQualityInput): ClaimQualityIssue | null {
  const parts = getDiscriminatingNameParts(input.politicianName);
  for (const part of parts) {
    if (hebrewWordMatch(input.quote, part)) {
      return {
        code: "self-reference",
        reason: `שם הפוליטיקאי מופיע בתוך הציטוט ("${part}") - כנראה דיווח על הפוליטיקאי, לא אמירה שלו`,
      };
    }
  }
  return null;
}

function newsNarrative(input: ClaimQualityInput): ClaimQualityIssue | null {
  if (isWrappedInQuotes(input.quote)) return null;
  if (FIRST_PERSON_RE.test(input.quote)) return null;

  const possessiveStart = startsWithPossessiveNarrative(input.quote);
  if (possessiveStart) {
    return {
      code: "news-narrative",
      reason: `נפתח בתיאור גוף שלישי על הפוליטיקאי ("${possessiveStart}")`,
    };
  }

  const verb = startsWithThirdPersonAction(input.quote);
  if (verb) {
    return {
      code: "news-narrative",
      reason: `נפתח בפועל גוף שלישי עיתונאי ("${verb}")`,
    };
  }

  if (input.source !== "כנסת · מליאה") {
    const backgroundStart = startsWithArticleBackground(input.quote);
    if (backgroundStart) {
      return {
        code: "news-narrative",
        reason: `נראה כמו משפט רקע עיתונאי, לא ציטוט ("${backgroundStart}...")`,
      };
    }
  }

  return null;
}

function opinionInsult(input: ClaimQualityInput): ClaimQualityIssue | null {
  if (/\d{2,}/.test(input.quote) || FIRST_PERSON_RE.test(input.quote)) return null;
  const insult = INSULT_WORDS.find((word) => hebrewWordMatch(input.quote, word));
  if (!insult) return null;
  return {
    code: "opinion-insult",
    reason: `מכיל עלבון/שיפוט לא עובדתי ("${insult}") בלי עוגן עובדתי`,
  };
}

export function findClaimQualityIssues(input: ClaimQualityInput): ClaimQualityIssue[] {
  return [
    newsNarrative(input),
    selfReferencesPolitician(input),
    opinionInsult(input),
  ].filter(Boolean) as ClaimQualityIssue[];
}

export function shouldRejectExtractedClaim(input: ClaimQualityInput): boolean {
  return findClaimQualityIssues(input).length > 0;
}
