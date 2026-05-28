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
  code: "news-narrative" | "self-reference" | "opinion-insult" | "eulogy-memorial" | "ceremonial" | "metaphor-idiom";
  reason: string;
}

// First-person markers. If any of these appears in the quote as a whole
// word, we treat it as the politician speaking and never flag it as
// news-narrative — the more common case is the politician saying
// "Liberman sent me a letter" (first-person framing), even though the
// sentence starts with the third-person verb "sent".
//
// IMPORTANT: must use `hebrewWordMatch` (defined below) for the check.
// JavaScript regex `\b` is ASCII-only — `/\b(אני)\b/` against pure
// Hebrew text never matches because `\b` can't establish a boundary
// between two non-word characters (space + Hebrew letter are both
// "non-word" in the default `\w` class). The previous version used `\b`
// and was silently broken — none of these patterns were ever matched,
// so every claim slipped past the first-person whitelist.
//
// Categories (order doesn't matter, used as a flat list):
//  - explicit subject pronouns: אני, אנחנו, אנו
//  - first-person past-tense verb conjugations (-תי suffix)
//  - first-person future-tense verb conjugations (-נ prefix plural)
//  - pronominal forms: לי, אותי, שלי, אצלי, אליי/אלי, ממני, בשבילי,
//    עליי/עלי, אתי/איתי
const FIRST_PERSON_MARKERS: string[] = [
  "אני", "אנחנו", "אנו",
  "הוצאנו", "החלטתי", "חתמתי", "התפטרתי", "הקמתי", "אמרתי", "אגיד", "אומר",
  "נחלץ", "נטפל", "נקים", "נצליח", "הצבעתי", "התקשרתי", "פעלתי",
  "ביקשתי", "דרשתי", "סיכלנו", "עשינו", "העברנו", "הקמנו",
  "לי", "אותי", "שלי", "אצלי", "אליי", "אלי", "ממני", "בשבילי",
  "עליי", "עלי", "אתי", "איתי",
];

function hasFirstPersonMarker(quote: string): boolean {
  for (const marker of FIRST_PERSON_MARKERS) {
    if (hebrewWordMatch(quote, marker)) return true;
  }
  return false;
}

// Third-person past-tense action verbs commonly used by journalists to
// describe what a politician did. A "quote" that starts with one of these
// is almost certainly news prose mis-extracted as a quote, not the
// politician's own words.
//
// Deliberately EXCLUDED — these are quote-introducing verbs ("X said Y"):
//   אמר, אמרה, טען, טענה, הצהיר, הצהירה, מסר, מסרה, ציין, ציינה,
//   הוסיף, הוסיפה, סיפר, סיפרה, השיב, השיבה
// Including those would falsely reject legitimate paraphrases of the form
// "Smotrich claimed the deficit will stay below 4%".
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
  // Added 2026-05-17 after a Netanyahu "quote" reading "עיכב את פרסום הדוח..."
  // (he delayed the publication of the report) was approved — clearly a
  // news-narrative report, not a quote. Expanded the list with verbs that
  // commonly head news headlines describing politician actions.
  "עיכב", "עיכבה",
  "תקף", "תקפה",
  "גינה", "גינתה",
  "דרש", "דרשה",
  "הוביל", "הובילה",
  "יזם", "יזמה",
  "שלל", "שללה",
  "הזהיר", "הזהירה",
  "הציג", "הציגה",
  "ביטל", "ביטלה",
  "השעה", "השעתה",
  "בירך", "בירכה",
  "שיגר", "שיגרה",
  "כתב", "כתבה",
  "שלח", "שלחה",
  "הקים", "הקימה",
  "התנגד", "התנגדה",
  "הסכים", "הסכימה",
  "הביע", "הביעה",
  "הופיע", "הופיעה",
  "השתתף", "השתתפה",
  "חזר", "חזרה",
  "נסע", "נסעה",
  "טס", "טסה",
  "הציל", "הצילה",
  "קרא", "קראה",
  "קבע", "קבעה",
  "תיאר", "תיארה",
  "התריע", "התריעה",
  "הוקיר", "הוקירה",
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
  if (hasFirstPersonMarker(input.quote)) return null;

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

// Eulogy / memorial / blessing / prayer patterns — content that is NOT
// fact-checkable regardless of whether it's factually accurate. A claim
// like "Sapir z\"l fell in battle in Lebanon" can be technically true,
// but it has no place on a political fact-check site — it's a tragic
// news item, not a political claim.
//
// All patterns are intentional substring matches (no \b — JS word
// boundaries don't work between Hebrew chars). Each pattern is
// distinctive enough that false positives are rare. The audit on
// 2026-05-26 found 24 of 133 approved Telegram claims (18%) matched
// at least one of these — Distel's channel was 8/8.
const EULOGY_PATTERNS: { code: string; rx: RegExp; reason: string }[] = [
  {
    // Negative lookbehind on `ח` excludes "חז״ל" — the fixed idiom
    // meaning "our sages of blessed memory" (Talmudic teachers). That's
    // a religious citation marker, not a fallen-soldier eulogy.
    code: "memorial-marker",
    rx: /(?<!ח)ז["״]ל|הי["״]ד/,
    reason: 'הספד/אזכרה ("ז״ל" או "הי״ד")',
  },
  {
    code: "fell-in-battle",
    rx: /נפל(?:ה|ו)? ב(?:קרב|מערכה|דרום|צפון|לבנון|רצועה|עזה|פעילות מבצעית|מילוי תפקיד)/,
    reason: "תיאור נפילה בקרב",
  },
  {
    code: "left-behind",
    rx: /הותיר(?:ה)? אחרי(?:ו|ה)|השאיר(?:ה)? אחרי(?:ו|ה)|אחריו אישה|אחריו הורים|אחריו ילדים|אחריה בעל|אחריה הורים/,
    reason: "תיאור משפחה שנותרה אחרי אדם שמת",
  },
  {
    code: "funeral",
    rx: /הלוויה|הלווייתו|הלווייתה|לזכרו|לזכרה|לזכר ה|תהא נשמתו|תהא נשמתה|יהי זכרו|יהי זכרה|נשמתו צרורה|נשמתה צרורה|למלאת שלושים|למלאת שנה לפטירתו|למלאת שנה לפטירתה/,
    reason: "שפה של אזכרה/הלוויה",
  },
  {
    code: "condolences",
    rx: /משתתפים בצער|אבל כבד|אבל עמוק|מנחם אבלים|תנחומיי|תנחומינו|שולחים תנחומים|בכאב גדול/,
    reason: "ניחומים/הבעת אבל",
  },
  {
    code: "blessings",
    rx: /שבת שלום|חג שמח|מועדים לשמחה|חג פסח שמח|ראש השנה|יום העצמאות שמח|פורים שמח|חנוכה שמח|בריאות איתנה ל|מזל טוב ל/,
    reason: "ברכות/איחולים",
  },
  {
    code: "religious-personal",
    rx: /התפללתי לעילוי נשמת|תהא נשמתו|בעזרת השם|בעז["״]ה ננצח|אדוננו בר יוחאי|תורתו מגן/,
    reason: "תוכן דתי-אישי, לא טענה ציבורית",
  },
];

function eulogyOrMemorial(input: ClaimQualityInput): ClaimQualityIssue | null {
  const text = input.quote;
  for (const pat of EULOGY_PATTERNS) {
    if (pat.rx.test(text)) {
      return { code: "eulogy-memorial", reason: pat.reason };
    }
  }
  return null;
}

// Ceremonial / press-release patterns — the politician's quote is a thanks
// statement, congratulations, announcement of own routine action, or
// personal pride moment. Technically may have verifiable content (e.g.
// "I thank X who passed bill Y" is true if Y was indeed passed) but the
// quote itself is not a fact-check item — it's PR.
//
// Distinguished from `news-narrative` (which catches third-person
// reporting) — these are FIRST-PERSON ceremonial speech.
const CEREMONIAL_PATTERNS: { rx: RegExp; reason: string }[] = [
  {
    rx: /^[\s"״]*(?:אני|אנו|אנחנו)\s*מודה|^[\s"״]*ברצוני להודות|^[\s"״]*תודה (?:רבה|גדולה|ענקית)|אני מבקש להודות|אבקש להודות|אני שמח להודות/,
    reason: "פתיחה בתודות/הוקרה — לא טענה ניתנת לבדיקה",
  },
  {
    rx: /^[\s"״]*אני גאה|^[\s"״]*גאה (?:להציג|לבשר|לכבד|לשתף)|^[\s"״]*התרגשתי|^[\s"״]*מרגש (?:לראות|לפגוש)|^[\s"״]*כבוד (?:גדול|הוא לי)|^[\s"״]*זכות (?:גדולה|היא לי)/,
    reason: "ביטוי גאווה/התרגשות אישית — לא טענה ניתנת לבדיקה",
  },
  {
    rx: /^[\s"״]*אני שמח (?:לבשר|להודיע|לעדכן|לשתף)|אבקש לבשר|אבקש להודיע|^[\s"״]*בשורה (?:משמחת|טובה|חשובה|היסטורית)/,
    reason: "הודעת PR שגרתית — לא טענה ניתנת לבדיקה",
  },
  {
    // Diplomatic mutual-praise — self-reported private conversation where the
    // politician expresses appreciation/gratitude/respect for another leader.
    // Added 2026-05-28 after a Netanyahu claim "הבעתי בפני הנשיא טראמפ את
    // הערכתי העמוקה..." was approved as TRUE — the verifier confirmed the
    // underlying operations existed, but the actual claim (Netanyahu thanked
    // Trump in private) is unverifiable and has zero public-accountability
    // value. Editor criterion #12 territory.
    //
    // Matches first-person "expressed [appreciation/gratitude/honor/respect/
    // praise/solidarity]" patterns. Does NOT include תמיכה/התנגדות (support/
    // opposition) because those are policy positions.
    // The intermediate `[^"״.]{0,50}?` allows the addressee phrase between
    // the verb and the noun ("בפני הנשיא טראמפ את", "לראש האו״ם", "כלפי
    // משפחות החטופים את"). Capped at 50 chars and gated on no-period/quote
    // so we don't spill across sentence boundaries inside a longer quote.
    rx: /^[\s"״]*(?:אני\s+)?(?:הבעתי|הבענו|מביע|מביעה|מביעים|אביע|נביע|ברצוני להביע|אבקש להביע)\s[^"״.]{0,50}?(?:הערכ|תודה|תודת|הוקר|כבוד(?:י)?|שבח|הזדהו|התפעלות|התרגשות|התפעלותי|התרגשותי|הערצ)/,
    reason: "ביטוי דיפלומטי-טקסי של הערכה/תודה/הוקרה — לא טענה ניתנת לבדיקה",
  },
];

function ceremonial(input: ClaimQualityInput): ClaimQualityIssue | null {
  for (const pat of CEREMONIAL_PATTERNS) {
    if (pat.rx.test(input.quote)) {
      return { code: "ceremonial", reason: pat.reason };
    }
  }
  return null;
}

function opinionInsult(input: ClaimQualityInput): ClaimQualityIssue | null {
  if (/\d{2,}/.test(input.quote) || hasFirstPersonMarker(input.quote)) return null;
  const insult = INSULT_WORDS.find((word) => hebrewWordMatch(input.quote, word));
  if (!insult) return null;
  return {
    code: "opinion-insult",
    reason: `מכיל עלבון/שיפוט לא עובדתי ("${insult}") בלי עוגן עובדתי`,
  };
}

// Never-literal Hebrew political idioms. The extractor + fact-check
// prompts both ask the AI to skip metaphors, and the audit on
// 2026-05-27 found zero "metaphor marked false" cases in the corpus.
// This list is belt-and-suspenders: catches the handful of common
// political idioms that would be embarrassing if they ever slipped
// through, where the fact-checker might attempt literal verification.
//
// Each pattern must be specific enough to never collide with a literal
// usage. "חמור לבן" in Israeli political discourse is always Messianic
// analogy, never an actual donkey. "ירה לעצמו ברגל" is always
// figurative self-harm, never an actual shooting incident (those would
// be reported as "ירה ברגלו" / "פצוע ברגלו" / actual incident framing).
const METAPHOR_IDIOMS: { rx: RegExp; reason: string }[] = [
  {
    rx: /(?:רכוב|רכובה|רוכב|רוכבת|הגיע|הגיעה|בא|באה) על חמור לבן|חמור לבן (?:של|כדי|שיציל|שיביא)/,
    reason: 'ביטוי "חמור לבן" — דימוי משיחי-פוליטי, לא תיאור עובדתי',
  },
  {
    rx: /(?:יורה|יורים|ירה|ירתה|יורות) לעצמ(?:ו|ה|ם|ן) ברגל/,
    reason: 'ביטוי "יורה לעצמו ברגל" — דימוי לפגיעה עצמית, לא פעולה',
  },
  {
    rx: /(?:חופר|חופרת|חופרים|כורה|כורים|כרה|כרתה) (?:את )?(?:הקבר ש(?:לו|לה|להם)|קבר(?:ו|ה)|בור לעצמ(?:ו|ה|ם))/,
    reason: 'ביטוי "חופר את קברו" — דימוי, לא פעולה',
  },
  {
    rx: /(?:פתח|פתחה|פותח|פותחת|נפתחה) (?:את )?תיבת פנדורה/,
    reason: '"תיבת פנדורה" — דימוי, לא אירוע',
  },
  {
    rx: /בית (?:ה)?קלפים|כבית קלפים|מתמוטט (?:לו )?כבית/,
    reason: '"בית קלפים" — דימוי לקריסה, לא תיאור מבנה',
  },
  {
    rx: /זרע(?:ה|ו|תי|נו)? (?:את ה)?(?:סער|רוח)/,
    reason: 'ביטוי "זרע רוח/סער" — דימוי תנ"כי, לא פעולה',
  },
  {
    rx: /שופ(?:ך|כת|כים) שמן (?:על|אל) ה?מדורה/,
    reason: 'ביטוי "שופך שמן על המדורה" — דימוי להחרפה, לא פעולה',
  },
];

function metaphorIdiom(input: ClaimQualityInput): ClaimQualityIssue | null {
  for (const pat of METAPHOR_IDIOMS) {
    if (pat.rx.test(input.quote)) {
      return { code: "metaphor-idiom", reason: pat.reason };
    }
  }
  return null;
}

export function findClaimQualityIssues(input: ClaimQualityInput): ClaimQualityIssue[] {
  return [
    newsNarrative(input),
    selfReferencesPolitician(input),
    opinionInsult(input),
    eulogyOrMemorial(input),
    ceremonial(input),
    metaphorIdiom(input),
  ].filter(Boolean) as ClaimQualityIssue[];
}

export function shouldRejectExtractedClaim(input: ClaimQualityInput): boolean {
  return findClaimQualityIssues(input).length > 0;
}
