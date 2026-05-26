/**
 * Per-politician credibility breakdown by topic. Lives on
 * /politician/[id] between the timeline chart and the Knesset activity
 * card. Answers the natural follow-up to "what's this politician's
 * overall credibility?" — namely: "credible on what, exactly?"
 *
 * Computation: groups the politician's window-filtered claims by
 * normalized topic (so "מדיניות הביטחון בגבול" + "מבצע צבאי" both
 * roll up into ביטחון), filters to topics with at least MIN_PER_TOPIC
 * claims, and computes the same Wilson lower bound we use everywhere
 * else as the headline score.
 *
 * Each row links to the home feed pre-filtered to this politician +
 * topic combination, so a curious reader can read the actual claims
 * behind the number.
 *
 * Server component. The grouping is pure in-memory work on the claims
 * array the parent page already loaded — no new DB query.
 */
import Link from "next/link";
import { normalizeTopic, topicLabelToSlug } from "@/lib/topics";
import { wilsonLowerBound } from "@/lib/queries";

const MIN_PER_TOPIC = 5; // below this, the Wilson bound is too wide to be informative

function scoreColor(pct: number): string {
  if (pct < 40) return "var(--verdict-false)";
  if (pct < 60) return "var(--verdict-half)";
  return "var(--verdict-true)";
}

interface ClaimLike {
  verdict: string; // "true" | "half-true" | "false"
  topic: string | null | undefined;
}

interface TopicRow {
  topic: string;
  total: number;
  trueClaims: number;
  halfTrue: number;
  falseClaims: number;
  truthPercentage: number;
  credibilityScore: number;
}

function buildBreakdown(claims: ClaimLike[]): TopicRow[] {
  const byTopic = new Map<string, { trueClaims: number; halfTrue: number; falseClaims: number; total: number }>();
  for (const c of claims) {
    const key = normalizeTopic(c.topic);
    if (!key) continue;
    if (!byTopic.has(key)) {
      byTopic.set(key, { trueClaims: 0, halfTrue: 0, falseClaims: 0, total: 0 });
    }
    const bucket = byTopic.get(key)!;
    bucket.total++;
    if (c.verdict === "true") bucket.trueClaims++;
    else if (c.verdict === "half-true") bucket.halfTrue++;
    else if (c.verdict === "false") bucket.falseClaims++;
  }

  const rows: TopicRow[] = [];
  for (const [topic, b] of byTopic.entries()) {
    if (b.total < MIN_PER_TOPIC) continue;
    const weightedTrue = b.trueClaims + b.halfTrue * 0.5;
    rows.push({
      topic,
      total: b.total,
      trueClaims: b.trueClaims,
      halfTrue: b.halfTrue,
      falseClaims: b.falseClaims,
      truthPercentage: Math.round((weightedTrue / b.total) * 100),
      credibilityScore: Math.round(wilsonLowerBound(weightedTrue, b.total) * 100),
    });
  }
  // Sort by sample size desc — biggest topics first feels right for
  // "what does this person actually talk about" framing. The score
  // colour makes the credibility differences obvious without needing
  // to sort by them.
  rows.sort((a, b) => b.total - a.total);
  return rows;
}

interface Props {
  politicianId: string;
  claims: ClaimLike[];
  windowLabel?: string;
}

export function TopicBreakdown({ politicianId, claims, windowLabel }: Props) {
  const rows = buildBreakdown(claims);

  // Need at least 2 topics for the breakdown to be meaningful — one
  // row is just the headline restated.
  if (rows.length < 2) return null;

  // Insight line above the table: best vs. worst topic + spread.
  // A 30+ point gap is the threshold for it to read as a real story
  // ("they're a specialist on X, weak on Y") rather than noise.
  const byScore = [...rows].sort((a, b) => b.credibilityScore - a.credibilityScore);
  const strongest = byScore[0];
  const weakest = byScore[byScore.length - 1];
  const spread = strongest.credibilityScore - weakest.credibilityScore;
  const insight =
    spread >= 30
      ? `סטנדרט הדיוק של הפוליטיקאי משתנה דרמטית לפי נושא: ${spread} נקודות הפרש בין הנושא החזק ביותר (${strongest.topic}, ${strongest.credibilityScore}%) לנושא החלש ביותר (${weakest.topic}, ${weakest.credibilityScore}%). פער של גודל כזה מעיד על תחומי התמחות, או על נושאים שבהם הוא מסתמך על מקורות שאינם עומדים במבחן.`
      : spread >= 15
        ? `סטנדרט הדיוק עקבי יחסית בין נושאים, עם פער של ${spread} נקודות בלבד בין הנושא החזק (${strongest.topic}, ${strongest.credibilityScore}%) לחלש (${weakest.topic}, ${weakest.credibilityScore}%).`
        : null;

  return (
    <section
      className="bg-card border border-border-strong overflow-hidden mb-8"
      style={{ borderRadius: 4 }}
    >
      <div className="px-5 py-3.5 border-b border-border">
        <h2 className="font-black text-base tracking-tight">אמינות לפי נושא</h2>
        <div className="text-[10px] uppercase tracking-wider text-foreground-muted mt-0.5">
          {windowLabel ? `${windowLabel} · ` : ""}פילוח טענות לפי תחום
        </div>
      </div>
      {insight && (
        <div className="px-5 py-4 border-b border-border bg-muted/20">
          <p className="text-[14px] text-foreground leading-[1.7]">{insight}</p>
        </div>
      )}

      <ol>
        {rows.map((r) => {
          const falseWidth = (r.falseClaims / r.total) * 100;
          const halfWidth = (r.halfTrue / r.total) * 100;
          const trueWidth = (r.trueClaims / r.total) * 100;
          // Canonical topic → /topic/[slug] (compare across politicians).
          // Free-text topic (no canonical match) → filtered home feed
          // (this politician's claims, that exact topic string).
          const slug = topicLabelToSlug(r.topic);
          const href = slug
            ? `/topic/${slug}`
            : `/?politician=${politicianId}&topic=${encodeURIComponent(r.topic)}`;
          return (
            <li key={r.topic} className="border-b border-border last:border-b-0">
              <Link
                href={href}
                className="block px-5 py-3 hover:bg-muted/40 transition-colors"
                title={`${r.trueClaims} אמת · ${r.halfTrue} חצי · ${r.falseClaims} שקר`}
              >
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <span className="font-bold text-sm truncate">{r.topic}</span>
                  <div
                    className="flex items-baseline gap-1.5 shrink-0 tabular-nums"
                    title={`ציון מתוקנן לגודל מדגם. אחוז האמת הגולמי: ${r.truthPercentage}% מתוך ${r.total} טענות.`}
                  >
                    <span
                      className="font-black text-base leading-none"
                      style={{ color: scoreColor(r.credibilityScore) }}
                    >
                      {r.credibilityScore}
                      <span className="text-xs">%</span>
                    </span>
                    <span className="text-[10px] text-foreground-muted">
                      {r.truthPercentage}% · {r.total} טענות
                    </span>
                  </div>
                </div>

                <div
                  className="h-1.5 overflow-hidden flex bg-muted"
                  style={{ borderRadius: 1 }}
                >
                  <div
                    className="h-full"
                    style={{ width: `${falseWidth}%`, backgroundColor: "var(--verdict-false)" }}
                  />
                  <div
                    className="h-full"
                    style={{ width: `${halfWidth}%`, backgroundColor: "var(--verdict-half)" }}
                  />
                  <div
                    className="h-full"
                    style={{ width: `${trueWidth}%`, backgroundColor: "var(--verdict-true)" }}
                  />
                </div>
              </Link>
            </li>
          );
        })}
      </ol>

      <div className="px-5 py-2.5 text-[10px] text-foreground-muted/80 border-t border-border bg-muted/20">
        רק נושאים עם {MIN_PER_TOPIC}+ טענות מוצגים. לחיצה על שורה תפתח את הטענות הספציפיות.
      </div>
    </section>
  );
}
