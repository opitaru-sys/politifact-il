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
import type { WeeklyAnalysis } from "./digest-analysis";

function getGemini() {
  const apiKey = getEnvVar("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not found");
  return new GoogleGenAI({ apiKey });
}

const MODEL = "gemini-2.5-flash";

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

  // Compact JSON of the analysis — Gemini reads this as context.
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
        name: m.politician.name,
        party: m.politician.party,
        delta_points: Math.round(m.delta * 10) / 10,
        current_score_pct: m.currentScore,
        previous_score_pct: m.previousScore,
        sample_size: m.currentSample,
      })),
      losers: analysis.topLosers.map((m) => ({
        name: m.politician.name,
        party: m.politician.party,
        delta_points: Math.round(m.delta * 10) / 10,
        current_score_pct: m.currentScore,
        previous_score_pct: m.previousScore,
        sample_size: m.currentSample,
      })),
    },
    topics: {
      distribution: analysis.topicDistribution,
      worst: analysis.worstTopic,
      best: analysis.bestTopic,
    },
    volume_vs_accuracy: {
      top_by_volume: analysis.topByVolume,
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
    first_time_politicians: analysis.firstTimePoliticians,
    sources: analysis.sourceCounts,
  };

  return `אתה עורך פוליטי בכיר במגזין עיתונאי ישראלי בעל מוניטין (חשוב על "הארץ", "כלכליסט", "העין השביעית", "שיחה מקומית" — מקומות שהקוראים סומכים על האנליטיקה שלהם). תפקידך: לקרוא את הנתונים השבועיים של אתר בדוק (אתר עצמאי לבדיקת עובדות של פוליטיקאים ישראליים) ולכתוב סיכום שבועי שיהיה מעניין באמת.

**הקהל:** קוראי חדשות פוליטיות מעמיקות בישראל. הם מצפים לאנליזה, לא לסיכום נתונים.

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

**הנתונים השבועיים (שבוע שמסתיים ב-${dateLabel}):**

\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`

**המשימה:**

החזר JSON עם השדות:

\`\`\`
{
  "title": "כותרת הגיליון — חמש עד שמונה מילים שמסכמות את הסיפור המרכזי השבוע. לא 'סיכום שבועי'. משהו ספציפי לשבוע הזה.",
  "intro": "פתיחה של 2-3 משפטים. הסיפור המרכזי השבוע במבט מהיר. עיתונאית, לא תיאורית.",
  "insights": [
    { "heading": "כותרת קצרה (3-7 מילים)", "body": "פסקה של 2-4 משפטים עיתונאיים. תצפית + פרשנות. צטט מספרים ושמות." }
  ]
}
\`\`\`

מספר התובנות: בין 4 ל-9. אל תיצור תובנות חלשות סתם כדי להגיע למספר; אל תוותר על תובנה חזקה כדי להישאר תחת מספר. תן ערך.

סוגי תובנות שכדאי לחפש (חלקיים, לא רשימה ממצה):
- שינויים שבוע-מול-שבוע במבנה הפסקים (יותר חצי-אמת? יותר שקרים?).
- נושאים שזכו לתשומת לב לא פרופורציונלית, ומה אחוז האמת בהם.
- פוליטיקאים שמדברים הרבה אבל בלי דיוק (או להפך).
- סטיקיות של חוסר אמינות (מי שהיה נמוך נשאר נמוך).
- מתפרץ ראשון: פוליטיקאים חדשים השבוע במאגר.
- חוסר התאמה בין נושא שדנים בו לבין נושא שבו הפוליטיקאים אמינים.
- שינויי מגמה משמעותיים אצל פוליטיקאי בולט.
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

  return {
    title: String(parsed.title).trim(),
    intro: String(parsed.intro).trim(),
    insights: parsed.insights
      .filter((i): i is { heading: string; body: string } =>
        typeof i?.heading === "string" && typeof i?.body === "string",
      )
      .map((i) => ({
        heading: i.heading.trim(),
        body: stripAITropes(i.body.trim()),
      })),
  };
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
