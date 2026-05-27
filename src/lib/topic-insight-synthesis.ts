/**
 * AI-generated journalist-voice insights per canonical topic. Same
 * analysis→synthesis pattern as the weekly digest, scoped per topic.
 *
 * Used by scripts/generate-topic-insights.mts which runs weekly and
 * upserts a TopicInsight row per canonical topic. The topic page reads
 * the row (falling back to deterministic templates if missing).
 *
 * Cost: ~$0.01-0.03 per topic per week × 13 topics = ~$0.20/week.
 */
import { GoogleGenAI } from "@google/genai";
import { getEnvVar } from "./env";
import { genderOf } from "./politician-gender";
import { repairPoliticianMarkers } from "./insight-markup";
import { getPoliticianStatsForTopic } from "./topic-stats";
import { getPoliticianStats } from "./data";

function getGemini() {
  const apiKey = getEnvVar("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not found");
  return new GoogleGenAI({ apiKey });
}

const MODEL = "gemini-2.5-flash";

export async function synthesizeTopicInsight(slug: string, label: string): Promise<string> {
  // Use a 60-day window for the weekly cadence so we have enough
  // claims to find patterns — the topic page's live insights use the
  // page's selected window (typically 30 days).
  const WINDOW_DAYS = 60;
  const [topicStats, overallStats] = await Promise.all([
    getPoliticianStatsForTopic(slug, WINDOW_DAYS),
    getPoliticianStats(WINDOW_DAYS),
  ]);
  if (topicStats.length === 0) {
    throw new Error(`No topic stats for slug ${slug}`);
  }

  // Aggregate truth % on topic
  const topicTotal = topicStats.reduce((s, x) => s + x.totalClaims, 0);
  const topicWeighted = topicStats.reduce(
    (s, x) => s + x.trueClaims + x.halfTrueClaims * 0.5,
    0,
  );
  const topicTruthPct = topicTotal > 0 ? Math.round((topicWeighted / topicTotal) * 100) : 0;

  const siteTotal = overallStats.reduce((s, x) => s + x.totalClaims, 0);
  const siteWeighted = overallStats.reduce(
    (s, x) => s + x.trueClaims + x.halfTrueClaims * 0.5,
    0,
  );
  const siteTruthPct = siteTotal > 0 ? Math.round((siteWeighted / siteTotal) * 100) : 0;

  // Verdict shape
  const verdictTotals = topicStats.reduce(
    (acc, x) => ({
      true: acc.true + x.trueClaims,
      half: acc.half + x.halfTrueClaims,
      false: acc.false + x.falseClaims,
    }),
    { true: 0, half: 0, false: 0 },
  );

  // Discrepancy candidates (politicians whose topic score differs most
  // from their overall) — same logic as the deterministic insights band
  const overallById = new Map(overallStats.map((s) => [s.politician.id, s]));
  const discrepancies = topicStats
    .filter((s) => s.totalClaims >= 3)
    .map((row) => {
      const overall = overallById.get(row.politician.id);
      if (!overall || overall.totalClaims < 5) return null;
      return {
        id: row.politician.id,
        name: row.politician.name,
        gender: genderOf(row.politician.id),
        party: row.politician.party,
        topic_score: row.credibilityScore,
        overall_score: overall.credibilityScore,
        delta: row.credibilityScore - overall.credibilityScore,
        topic_claim_count: row.totalClaims,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 8);

  // Top by volume on topic
  const topByVolume = [...topicStats]
    .sort((a, b) => b.totalClaims - a.totalClaims)
    .slice(0, 6)
    .map((s) => ({
      id: s.politician.id,
      name: s.politician.name,
      gender: genderOf(s.politician.id),
      party: s.politician.party,
      claim_count: s.totalClaims,
      truth_pct: s.truthPercentage,
      credibility_score: s.credibilityScore,
    }));

  const data = {
    topic_slug: slug,
    topic_label: label,
    window_days: WINDOW_DAYS,
    topic_claim_total: topicTotal,
    topic_truth_pct: topicTruthPct,
    site_truth_pct: siteTruthPct,
    truth_pct_delta_vs_site: topicTruthPct - siteTruthPct,
    topic_verdict_counts: verdictTotals,
    topic_politicians_count: topicStats.length,
    top_politicians_by_volume: topByVolume,
    biggest_discrepancies: discrepancies,
  };

  const prompt = `אתה עורך פוליטי בכיר במגזין עיתונאי ישראלי בעל מוניטין (חשוב על "הארץ", "כלכליסט", "העין השביעית", "שיחה מקומית"). תפקידך: לקרוא נתונים של חודשיים האחרונים בנושא "${label}" באתר בדוק (אתר עצמאי לבדיקת עובדות של פוליטיקאים ישראלים), ולכתוב 2-4 פסקאות תובנות שעיתונאי מנוסה היה מפרסם.

**הקהל:** קוראי חדשות פוליטיות מעמיקות בישראל. הם מצפים לאנליזה, לא לסיכום נתונים.

**הסגנון:**
- עיתונאות עברית רצינית. משפטים קצרים. עובדות לפני פרשנות.
- ציטוט מספרים ושמות תמיד.
- כל פסקה: תצפית עובדתית בולטת + משפט פרשני של "אז מה הסיפור".

**אסור:**
- מקפים ארוכים (—). השתמש בנקודות או פסיקים.
- "ראוי לציין ש", "יש לשים לב ש", "מצד שני", "מאידך", "מעניין ש", "באופן מפתיע", "בסיכומו של דבר", "לסיכום".
- פתיחות גנריות. פתח עם העובדה הקונקרטית.

**עברית מגדרית:** לכל פוליטיקאי/ת בנתונים יש שדה \`gender\` ("M" או "F"). השתמש בצורה הנכונה.

**עיטוף שמות לקישורים:** כל אזכור של פוליטיקאי/ת ב-body חייב להיות עטוף בפורמט \`{{P:id|שם להצגה}}\`. השם הוא בדיוק כמו שאתה כותב אותו. דוגמה: "{{P:netanyahu|בנימין נתניהו}} הציג 59% אמת".

**הנתונים:**
\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`

**המשימה:** החזר רק טקסט עברי — 2 עד 4 פסקאות, מופרדות בשורה ריקה. בלי כותרת. בלי JSON. בלי מטא-טקסט. רק הפסקאות עצמן.

אם הנתונים דלים מדי לכתוב 2 פסקאות איכותיות, החזר פסקה אחת מתומצתת. עדיף פסקה חזקה מ-3 חלשות.`;

  const response = await getGemini().models.generateContent({
    model: MODEL,
    contents: prompt,
  });
  const raw = (response.text ?? "").trim();
  if (!raw) throw new Error(`Empty synthesis response for topic ${slug}`);

  // Repair malformed politician markers — the AI sometimes emits
  // `{{P:Hebrew name}}` (no pipe) instead of `{{P:id|name}}`. Build
  // both lookup maps from the same data we passed in the prompt so
  // the repair has authoritative ground truth.
  const nameToId = new Map<string, string>();
  const idToName = new Map<string, string>();
  for (const p of [...topByVolume, ...discrepancies]) {
    nameToId.set(p.name, p.id);
    idToName.set(p.id, p.name);
  }
  const repaired = repairPoliticianMarkers(raw, nameToId, idToName);

  // Light cleanup: zap em-dashes that slipped through, drop common
  // opener crutches.
  return repaired
    .replace(/\s*[—–]\s*/g, ". ")
    .replace(/^ראוי לציין (?:ש|כי)\s*/gm, "")
    .replace(/^יש לשים לב (?:ש|כי)\s*/gm, "")
    .replace(/^באופן מעניין,?\s*/gm, "")
    .replace(/^באופן מפתיע,?\s*/gm, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
