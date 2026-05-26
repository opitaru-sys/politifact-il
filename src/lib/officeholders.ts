/**
 * Current officeholders block — injected into every Gemini call (fact-check
 * + verifier) to combat training-data anchoring.
 *
 * Why this exists: Gemini 2.5 Flash's pre-training cutoff predates several
 * recent transitions (Biden→Trump on 20.1.2025, Halevi→Zamir on the IDF
 * Chief of Staff seat in March 2025, Gallant→Katz at Defense in Nov 2024,
 * etc.). Even with Google Search grounding enabled, the model sometimes
 * overrides the search results with its strong prior — producing
 * explanations like "Trump is not the US president" that publicly
 * embarrass the site.
 *
 * The verifier doesn't use grounding at all (by design — it checks
 * internal consistency, not new facts), so for the verifier this block
 * is the ONLY source of truth on who holds which office.
 *
 * Maintenance: when an officeholder changes, update this file. The
 * change propagates to both `fact-check.ts` (extractor + fact-checker)
 * and `verify-claim.ts` automatically.
 *
 * Keep the list FOCUSED — top of mind for Israeli political claims +
 * positions where there was a recent transition. Bloating the list
 * costs prompt tokens on every call without adding much safety value.
 */

/**
 * Returns the Hebrew-formatted "current officeholders" block to inject
 * into a prompt. Call this on every Gemini request that might need to
 * reason about who currently holds an office.
 */
export function currentOfficeholdersBlock(): string {
  return `**בעלי תפקידים נוכחיים (אסור לסתור — זה ה-ground truth של המערכת):**
- נשיא ארה״ב: דונלד טראמפ (טראמפ הוא הנשיא ה-47, מכהן מאז 20.1.2025; ג׳ו ביידן סיים את כהונתו באותו תאריך).
- סגן נשיא ארה״ב: ג׳יי. די. ואנס.
- מזכיר המדינה האמריקאי: מרקו רוביו.
- ראש ממשלת ישראל: בנימין נתניהו.
- נשיא מדינת ישראל: יצחק הרצוג.
- שר הביטחון: ישראל כץ (מכהן מנובמבר 2024; יואב גלנט הודח על ידי נתניהו ב-5.11.2024).
- שר האוצר: בצלאל סמוטריץ׳.
- השר לביטחון לאומי: איתמר בן-גביר.
- שר המשפטים: יריב לוין.
- שר החוץ: גדעון סער.
- רמטכ״ל: רא״ל אייל זמיר (מכהן ממרץ 2025; רא״ל הרצי הלוי סיים את תפקידו).
- ראש ממשלת בריטניה: קיר סטארמר (לייבור, מכהן מיולי 2024; ריצ׳י סונאק סיים).
- נשיא צרפת: עמנואל מקרון.
- קנצלר גרמניה: פרידריך מרץ (CDU, מכהן ממאי 2025; אולף שולץ סיים).
- נשיא רוסיה: ולדימיר פוטין.

**הוראה:** אם הטענה או ההסבר מתייחסים לבעל תפקיד נוכחי באופן שסותר את הרשימה הזו, **אתה טועה** — לא הרשימה. הרשימה מתעדכנת ידנית ומקדימה את ידע המודל. אם הטענה מתייחסת לתפקיד שלא ברשימה (שר חינוך, ראש מוסד, וכו׳) — חפש לפני שאתה מניח.

`;
}
