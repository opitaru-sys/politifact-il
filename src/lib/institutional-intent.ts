/**
 * Shared constants + helpers for the "institutional-intent declaration"
 * verdict policy. See docs/superpowers/specs/2026-05-27-institutional-intent-criterion-design.md
 * for the principle and Dr. Tehila Shwartz Altshuler's originating feedback.
 *
 * Pattern: a politician declares their institution will take a specific
 * action (boycott / refuse / withhold / block) against a named target.
 * Verifying that the politician SAID it does not verify that the
 * institution will actually DO it. We downgrade these to half-true with
 * a fixed caveat.
 */

/** Tag the verifier emits in `issues` to signal a downgrade rather than a reject.
 *  fact-check.ts's post-processor picks this up and rewrites verdict + explanation. */
export const DOWNGRADE_TAG = "[downgrade-to-half-true]";

/** Prepended to the explanation when a claim is downgraded. The double newline
 *  separates the caveat from the original explanation. */
export const HEBREW_CAVEAT =
  "**הצהרת כוונה מוסדית:** בדיקה זו מאמתת שהצהרה זו אכן נאמרה בפומבי על ידי הפוליטיקאי. היא **אינה** מאמתת האם המוסד שבראשו עומד הפוליטיקאי אכן יבצע את הפעולה המוצהרת, האם קיימת לו סמכות חוקית לעשות זאת, או שהפעולה הוכנסה לפועל בפועל.";

/** Conservative regex for the sweep + triage scripts. Catches Hebrew
 *  institutional-action verbs in future-tense or imperative form combined
 *  with negation or refusal markers. Examples it should match:
 *    "מערכת הביטחון לא תקיים עם דן חלוץ כל קשר"
 *    "נחרים את עמותת X"
 *    "המשרד לא יקבל את Y"
 *    "אני מורה לצבא לא לעבוד עם Z"
 *  This is intentionally narrow — we'd rather miss some than down-grade
 *  legitimate factual claims. The verifier prompt catches the broader set. */
export const INSTITUTIONAL_INTENT_RE =
  /(?:לא ית?קיים|לא יקבל|לא תקבל|לא ימומן|לא תמומן|לא נעב(?:ו|ו)ד|לא יעב(?:ו|ו)ד|לא יסכים|לא תסכים|נחרים|יחרים|תחרים|נחסום|יחסום|תחסום|נסרב|יסרב|תסרב|אני מורה|הוריתי ל|אינסטרוקציה|נמנע מ|תימנע מ)\b/;

/**
 * Apply the downgrade: rewrite the verdict to "half-true", prepend the
 * caveat to the explanation if not already present, and append the
 * downgrade tag to the notes if not already present.
 *
 * Idempotent — running it twice on the same claim is a no-op.
 */
export function applyDowngrade(input: {
  verdict: string;
  explanation: string;
  notes: string[];
}): { verdict: "half-true"; explanation: string; notes: string[] } {
  const hasCaveat = input.explanation.startsWith(HEBREW_CAVEAT);
  const explanation = hasCaveat
    ? input.explanation
    : `${HEBREW_CAVEAT}\n\n${input.explanation}`;
  const hasTag = input.notes.some((n) => n.includes(DOWNGRADE_TAG));
  const notes = hasTag ? input.notes : [...input.notes, DOWNGRADE_TAG];
  return { verdict: "half-true", explanation, notes };
}
