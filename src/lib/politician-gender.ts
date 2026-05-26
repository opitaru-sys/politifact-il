/**
 * Hardcoded mapping of politician IDs to grammatical gender, for
 * Hebrew text generation that needs correct verb / pronoun
 * agreement.
 *
 * Why a hardcoded map and not a DB column:
 *  - Adding a column requires a migration + admin UI to set the
 *    value per row + backfill — heavy for what's effectively a
 *    static attribute of a person.
 *  - The MK roster turns over slowly (every 4 years, give or take).
 *    A code-level list is easy to grep and audit, and a missing
 *    entry defaults to masculine — the only failure mode is the
 *    generic Hebrew default, not a wrong gendered statement.
 *  - Avoids name-based heuristics, which would inevitably misclassify
 *    "Sharon" / "Adi" / etc. (both genders exist in Hebrew).
 *
 * Coverage today: the female MKs of the 25th Knesset whose names I
 * could verify. When adding a new politician to NAME_TO_ID, also
 * add them here if female. Missing entries fall through to "M".
 */
const FEMALE_IDS: ReadonlySet<string> = new Set([
  "orit-strook",
  "orit-farkash-hacohen",
  "iman-khatib-yasin",
  "efrat-rayten",
  "gila-gamliel",
  "galit-distel",
  "debbie-biton",
  "tali-gottlieb",
  "yulia-malinovsky",
  "yasmin-fridman",
  "limor-son-har-melech",
  "may-golan",
  "michal-waldiger",
  "meirav-ben-ari",
  "meirav-cohen",
  "miri-regev",
  "michaeli",
  "naama-lazimi",
  "aida-touma-suleiman",
  "idit-silman",
  "pnina-tamano-shata",
  "tsega-melaku",
  "karine-elharrar",
  "keti-shitrit",
  "shelly-tal-meron",
  "sharren-haskel",
]);

export type Gender = "M" | "F";

export function genderOf(politicianId: string): Gender {
  return FEMALE_IDS.has(politicianId) ? "F" : "M";
}

/**
 * Pick the right Hebrew form based on the subject's gender. Use for
 * inline templated prose:
 *   `${name} ${verb(g, "מקבל", "מקבלת")} ${score}% בנושא...`
 */
export function verb(gender: Gender, masculine: string, feminine: string): string {
  return gender === "F" ? feminine : masculine;
}

/**
 * Pronouns shortcut. `pronoun(g, "subject")` returns "הוא" / "היא"
 * etc. Avoids the bigger `verb()` call for these very-common cases.
 */
export function pronoun(gender: Gender, form: "subject" | "object" | "possessive" | "from"): string {
  if (gender === "F") {
    switch (form) {
      case "subject":    return "היא";    // she
      case "object":     return "אותה";   // her (direct object)
      case "possessive": return "שלה";    // her/hers
      case "from":       return "ממנה";   // from her
    }
  }
  switch (form) {
    case "subject":    return "הוא";
    case "object":     return "אותו";
    case "possessive": return "שלו";
    case "from":       return "ממנו";
  }
}
