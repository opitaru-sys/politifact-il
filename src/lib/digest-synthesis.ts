/**
 * Turns a WeeklyAnalysis blob into journalist-voice insight paragraphs
 * via Gemini. Single call per digest generation, ~$0.01-0.05.
 *
 * The prompt is the product. It tells Gemini explicitly:
 *  - Voice: senior Hebrew political journalist (Haaretz / Calcalist /
 *    The Seventh Eye register). Concrete, skeptical, economical.
 *  - Banned constructions: em-dashes, AI throat-clearing ("ראוי לציין",
 *    "יש לשים לב", "מצד שני", "מעניין ש"), generic openers, ChatGPT
 *    favourite stock phrases.
 *  - Each insight: observation + interpretation. Cite numbers/names.
 *  - Find non-obvious patterns. Skip if you can't find them.
 *
 * If the call fails, the generator falls back to a basic deterministic
 * digest so the cron never produces an empty draft.
 */
import { GoogleGenAI } from "@google/genai";
import { getEnvVar } from "./env";
import { genderOf } from "./politician-gender";
import { repairPoliticianMarkers } from "./insight-markup";
import type { WeeklyAnalysis } from "./digest-analysis";
import { MODEL_FLASH as MODEL } from "./gemini-models";

function getGemini() {
  const apiKey = getEnvVar("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not found");
  return new GoogleGenAI({ apiKey });
}

export interface SynthesizedInsight {
  heading: string;
  body: string;
}

export interface SynthesizedDigest {
  title: string;
  intro: string;
  insights: SynthesizedInsight[];
}

/**
 * Build the prompt by serializing the analysis blob into a compact
 * Hebrew brief, then giving Gemini the voice + rules + output schema.
 *
 * We pass the blob as JSON inside the prompt rather than via the
 * `responseSchema` config because (a) Gemini's JSON output handling
 * has been more reliable when the schema is implicit, and (b) we
 * already use parseJsonLoose elsewhere to recover malformed JSON.
 */
function buildPrompt(analysis: WeeklyAnalysis): string {
  const dateLabel = analysis.weekOf.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Compact JSON of the analysis — Gemini reads this as context. Every
  // politician entry carries `id` and `gender` so the prompt can
  // (a) wrap names in the {{P:id|Name}} hyperlink marker and
  // (b) use the right Hebrew verb / pronoun form.
  const data = {
    week_ending: analysis.weekOf.toISOString().slice(0, 10),
    week_label_hebrew: dateLabel,
    totals: {
      claims_this_week: analysis.totalClaims,
      distinct_politicians: analysis.distinctPoliticians,
      verdict_counts: analysis.verdictCounts,
      verdict_share_pct: analysis.verdictShareThisWeek,
      aggregate_truth_pct: analysis.truthPercentage,
    },
    week_over_week: {
      claims_last_week: analysis.prevWeekTotalClaims,
      truth_pct_last_week: analysis.prevWeekTruthPercentage,
      truth_pct_delta: analysis.truthPercentageDelta,
      verdict_share_last_week: analysis.verdictShareLastWeek,
    },
    movers_7_day: {
      gainers: analysis.topGainers.map((m) => ({
        id: m.politician.id,
        name: m.politician.name,
        gender: genderOf(m.politician.id),
        party: m.politician.party,
        delta_points: Math.round(m.delta * 10) / 10,
        current_score_pct: m.currentScore,
        previous_score_pct: m.previousScore,
        sample_size: m.currentSample,
      })),
      losers: analysis.topLosers.map((m) => ({
        id: m.politician.id,
        name: m.politician.name,
        gender: genderOf(m.politician.id),
        party: m.politician.party,
        delta_points: Math.round(m.delta * 10) / 10,
        current_score_pct: m.currentScore,
        previous_score_pct: m.previousScore,
        sample_size: m.currentSample,
      })),
    },
    top_misleaders: analysis.topMisleaders.map((m) => ({
      id: m.politicianId,
      name: m.politicianName,
      gender: genderOf(m.politicianId),
      party: m.party,
      lie_score: m.lieScore,
      false_count: m.falseCount,
      half_true_count: m.halfCount,
      true_count: m.trueCount,
      claim_count: m.claimCount,
      truth_pct: m.truthPercentage,
    })),
    topics: {
      distribution: analysis.topicDistribution,
      worst: analysis.worstTopic,
      best: analysis.bestTopic,
    },
    volume_vs_accuracy: {
      top_by_volume: analysis.topByVolume.map((p) => ({
        id: p.politicianId,
        name: p.politicianName,
        gender: genderOf(p.politicianId),
        party: p.party,
        claim_count: p.claimCount,
        truth_pct: p.truthPercentage,
      })),
      top_volume_avg_truth_pct: analysis.topVolumeAvgTruth,
      week_avg_truth_pct: analysis.weekAvgTruth,
    },
    persistence: {
      persistent_low: analysis.persistentLow,
      total_low_last_week: analysis.totalLowLastWeek,
      persistence_rate_pct:
        analysis.totalLowLastWeek > 0
          ? Math.round((analysis.persistentLow / analysis.totalLowLastWeek) * 100)
          : null,
    },
    first_time_politicians: analysis.firstTimePoliticians.map((p) => ({
      id: p.id,
      name: p.name,
      gender: genderOf(p.id),
      party: p.party,
    })),
    sources: analysis.sourceCounts,
  };

  return `אתה עורך פוליטי בכיר במגזין עיתונאי ישראלי בעל מוניטין (חשוב על "הארץ", "כלכליסט", "העין השביעית", "שיחה מקומית" — מקומות שהקוראים סומכים על האנליטיקה שלהם). תפקידך: לקרוא את הנתונים השבועיים של אתר בדוק (אתר עצמאי לבדיקת עובדות של פוליטיקאים ישראליים) ולכתוב סיכום שבועי שיהיה מעניין באמת.

**הקהל:** קוראי חדשות פוליטיות מעמיקות בישראל. הם מצפים לאנליזה, לא לסיכום נתונים.

**איך בדוק מודד פוליטיקאים (חשוב למסגור):**
בדוק מדרג פוליטיקאים לפי כמה הם הטעו את הציבור, לא לפי כמה הם "אמינים". המדד המרכזי הוא "ניקוד הטעיה": טענה שקרית נספרת כ-1, חצי-אמת כ-0.5, אמת כ-0. ככל שהניקוד גבוה יותר, הפוליטיקאי הטעה יותר. בנתונים, השדה \`top_misleaders\` הוא הלב של הסיכום: אלה הפוליטיקאים שהטעו הכי הרבה השבוע.

**הסיכום חייב להוביל עם ההטעיה, לא עם "אחוז אמת כללי".** התובנה הראשונה צריכה להיות על מי הטעה הכי הרבה השבוע ומה בדיוק הוא אמר. אל תפתח בנימה חיובית מרגיעה ("עלייה באמינות", "פחות שקרים") אלא אם זה באמת הסיפור הדומיננטי בנתונים. כשאתה מצטט מספר, העדף את ניקוד ההטעיה ואת מספר השקרים/חצאי-האמת על פני "אחוז אמת".

**הסגנון שלך:**
- עיתונאות עברית רצינית. משפטים קצרים. עובדות לפני פרשנות.
- ציטוט מספרים ושמות תמיד. בלי הכללות עמומות.
- כל תובנה: תצפית עובדתית בולטת + משפט פרשני של "אז מה הסיפור".
- שאל את עצמך: מה לא ברור במבט ראשון? מה ההפתעה? מה הסטייה מהציפייה?
- אל תהיה מפלגתי. הצביע על אסימטריות אם הן בנתונים.

**אסור:**
- מקפים ארוכים (—). השתמש בנקודות, פסיקים או סוגריים.
- "ראוי לציין ש", "יש לשים לב ש", "מצד שני", "מאידך", "מעניין ש", "באופן מפתיע", "בסיכומו של דבר", "לסיכום", "כפי שניתן לראות מהנתונים", "הנתונים מראים ש".
- פתיחות גנריות ("בשבוע שעבר אירעו אירועים רבים..."). פתח עם העובדה הקונקרטית.
- מילים שמרככות בלי סיבה: "לעיתים", "במידה מסוימת", "באופן יחסי".
- אימוג'ים. הדגשות מיותרות. סימני קריאה.

**שימוש בעברית מגדרית נכון:**
- כל פוליטיקאי/ת בנתונים מסומן/ת עם שדה \`gender\` ("M" או "F"). השתמש בצורת הפועל/השם/הכינוי המתאימה למגדר.
- דוגמאות לנשים: "מרב מיכאלי טענה" (לא "טען"), "היא מסתמכת" (לא "מסתמך"), "הציון שלה" (לא "שלו"), "ממנה" (לא "ממנו"), "מקבלת" (לא "מקבל"), "בולטת" (לא "בולט").
- בכותרת של פסקה שמתחילה בשם של פוליטיקאית, ודא שגם הפועל בכותרת מתואם: "מרב מיכאלי בולטת לרעה" (לא "בולט לרעה").

**קישורים לפוליטיקאים — חובה לעטוף שמות:**
- בכל פעם שאתה מזכיר שם של פוליטיקאי/ת בגוף הטקסט (\`body\`), עטוף את השם בפורמט: \`{{P:politician_id|שם להצגה}}\`.
- ה-\`politician_id\` מופיע בשדה \`id\` של כל פוליטיקאי/ת בנתונים. השם הוא בדיוק כפי שהיית רושם אותו בעברית בטקסט.
- דוגמה: במקום "בנימין נתניהו הציג 59% אמת" כתוב "{{P:netanyahu|בנימין נתניהו}} הציג 59% אמת".
- אל תעטוף שמות בכותרת (\`heading\`) — שם השדות \`P:id\` הוא רק ל-body.
- אם הזכרת אותה פוליטיקאית/ה כמה פעמים באותה פסקה, עטוף את כל המופעים.

**הנתונים השבועיים (שבוע שמסתיים ב-${dateLabel}):**

\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`

**המשימה:**

החזר JSON עם השדות:

\`\`\`
{
  "title": "כותרת הגיליון — חמש עד שמונה מילים. הסיפור המרכזי של ההטעיה השבוע. לא 'סיכום שבועי', לא 'זינוק באמינות'. חדה וספציפית לשבוע הזה. אפשר לנקוב בשם המטעה המוביל אם הוא הסיפור.",
  "intro": "פתיחה של 2-3 משפטים. מי הטעה הכי הרבה השבוע ומה הסיפור. עיתונאית, לא תיאורית.",
  "insights": [
    { "heading": "כותרת קצרה (3-7 מילים)", "body": "פסקה של 2-4 משפטים עיתונאיים. תצפית + פרשנות. צטט מספרים ושמות." }
  ]
}
\`\`\`

**התובנה הראשונה חייבת להיות על המטעים המובילים** (\`top_misleaders\`): מי הטעה הכי הרבה השבוע, כמה שקרים וחצאי-אמת, ובאיזה הקשר. נקוב בשמות ובמספרים.

מספר התובנות: בין 4 ל-9. אל תיצור תובנות חלשות סתם כדי להגיע למספר; אל תוותר על תובנה חזקה כדי להישאר תחת מספר. תן ערך.

סוגי תובנות שכדאי לחפש (חלקיים, לא רשימה ממצה):
- המטעים המובילים השבוע: מי, כמה, ועל מה (זו תמיד התובנה הראשונה).
- שינויים שבוע-מול-שבוע במבנה הפסקים (יותר חצי-אמת? יותר שקרים מוחלטים?).
- נושאים שייצרו הכי הרבה הטעיה (הנושא עם ניקוד ההטעיה הגבוה ביותר).
- פוליטיקאים שמדברים הרבה ומטעים הרבה (נפח גבוה + הטעיה גבוהה).
- סטיקיות של הטעיה (מי שהטעה הרבה בעבר וממשיך).
- מתפרץ ראשון: פוליטיקאים חדשים השבוע במאגר ואיך נפתחו.
- שינויי מגמה משמעותיים אצל פוליטיקאי בולט (לטובה או לרעה).
- דפוסי מקור: אילו ערוצי תוכן (Ynet, כנסת, טלגרם) מייצרים יותר טענות שקריות.

**אם פיסת נתונים חלשה או חסרה, פשוט אל תכתוב עליה תובנה.** עדיף 4 תובנות חזקות מ-8 בינוניות.`;
}

export async function synthesizeDigest(analysis: WeeklyAnalysis): Promise<SynthesizedDigest> {
  const prompt = buildPrompt(analysis);

  const response = await getGemini().models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    },
  });

  const raw = response.text ?? "";
  if (!raw.trim()) throw new Error("Empty synthesis response");

  // Strip code fences if Gemini wrapped output despite the mime hint.
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const parsed = JSON.parse(cleaned) as {
    title?: string;
    intro?: string;
    insights?: { heading?: string; body?: string }[];
  };

  if (!parsed.title || !parsed.intro || !Array.isArray(parsed.insights)) {
    throw new Error("Synthesis returned malformed digest");
  }

  // Build name↔id lookup maps from the analysis politicians so we can
  // repair malformed `{{P:name}}` markers the AI sometimes emits.
  const nameToId = new Map<string, string>();
  const idToName = new Map<string, string>();
  const collectPolitician = (p: { id: string; name: string } | { politician?: { id: string; name: string } }) => {
    if ("politician" in p && p.politician) {
      nameToId.set(p.politician.name, p.politician.id);
      idToName.set(p.politician.id, p.politician.name);
    } else if ("id" in p && "name" in p) {
      nameToId.set(p.name, p.id);
      idToName.set(p.id, p.name);
    }
  };
  for (const m of [...analysis.topGainers, ...analysis.topLosers]) collectPolitician(m);
  for (const p of analysis.topByVolume) {
    nameToId.set(p.politicianName, p.politicianId);
    idToName.set(p.politicianId, p.politicianName);
  }
  for (const p of analysis.firstTimePoliticians) collectPolitician(p);

  return {
    title: stripPoliticianMarkers(String(parsed.title).trim()),
    intro: stripPoliticianMarkers(String(parsed.intro).trim()),
    insights: parsed.insights
      .filter((i): i is { heading: string; body: string } =>
        typeof i?.heading === "string" && typeof i?.body === "string",
      )
      .map((i) => ({
        // Strip markers from heading — the prompt says don't put them
        // there but Gemini doesn't always listen, and a raw `{{P:...}}`
        // in a heading reads as a bug.
        heading: stripPoliticianMarkers(i.heading.trim()),
        // Repair malformed markers in body before applying trope cleanup.
        body: stripAITropes(repairPoliticianMarkers(i.body.trim(), nameToId, idToName)),
      })),
  };
}

/** Removes {{P:id|Name}} markers, leaving just the name. Used for
 *  fields where hyperlinks aren't appropriate (title, headings). */
function stripPoliticianMarkers(s: string): string {
  return s.replace(/\{\{P:[^|}]+\|([^}]+)\}\}/g, "$1");
}

/**
 * Last-line defense against Gemini sneaking AI tropes back in despite
 * the prompt. Pure-string cleanup: em-dashes become periods, the
 * worst stock phrases get trimmed if they leak. Conservative — we'd
 * rather edit lightly than mangle valid prose.
 */
function stripAITropes(s: string): string {
  return (
    s
      // Em-dashes and en-dashes → standard sentence punctuation.
      .replace(/\s*[—–]\s*/g, ". ")
      // Strip a few high-incidence opener crutches.
      .replace(/^ראוי לציין (?:ש|כי)\s*/g, "")
      .replace(/^יש לשים לב (?:ש|כי)\s*/g, "")
      .replace(/^באופן מעניין,?\s*/g, "")
      .replace(/^באופן מפתיע,?\s*/g, "")
      .replace(/^מעניין (?:ש|כי)\s*/g, "")
      // Collapse the double-space artifacts the replacements may leave.
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}
