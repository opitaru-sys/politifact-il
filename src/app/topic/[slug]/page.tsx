/**
 * Topic landing page. One URL per canonical topic
 * (/topic/security, /topic/economy, /topic/justice, ...).
 *
 * Lives between the home page (broad cross-politician view) and the
 * politician profile (narrow single-politician view) as the third
 * axis: one topic, all politicians. Answers "who's most/least credible
 * on the economy?" in one URL Google can rank for.
 *
 * Data slice only — no AI inference. Uses the existing canonical-topic
 * regex library in src/lib/topics.ts; same one powering the
 * per-politician TopicBreakdown card.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { slugToTopicLabel, listCanonicalTopics } from "@/lib/topics";
import {
  getPoliticianStatsForTopic,
  getRecentClaimsForTopic,
} from "@/lib/topic-stats";
import { getPoliticianStats } from "@/lib/data";
import { genderOf, verb, pronoun } from "@/lib/politician-gender";
import { markPolitician } from "@/lib/insight-markup";
import { prisma } from "@/lib/db";
import { PoliticianAvatar } from "@/components/PoliticianAvatar";
import { WindowSelector } from "@/components/WindowSelector";
import { ClaimCard } from "@/components/ClaimCard";
import { ShareButtons } from "@/components/ShareButtons";
import { InsightBody } from "@/components/InsightBody";
import { shareTextForRanking } from "@/lib/share-text";
import { resolveWindow, windowLabel as windowLabelFn } from "@/lib/window";
import type { Claim, Verdict } from "@/data/mock";

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://bduk.co.il";

/** Tells Next.js which slugs are known at build time. Helps SEO crawl
 *  and lets Vercel cache the per-slug shells. */
export async function generateStaticParams() {
  return listCanonicalTopics().map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const label = slugToTopicLabel(slug);
  if (!label) return {};
  return {
    title: `${label} · מי מטעה הכי הרבה | בדוק`,
    description: `מי מטעה הכי הרבה בנושא ${label}? דירוג פוליטיקאים לפי ניקוד הטעיה, מבוסס על טענות שנבדקו.`,
    openGraph: {
      title: `מי מטעה הכי הרבה בנושא ${label}`,
      description: `דירוג פוליטיקאים ישראליים על נושא ${label}.`,
      url: `${SITE_URL}/topic/${slug}`,
    },
  };
}

const MIN_FOR_RANKING = 3;
const TOP_BOTTOM_COUNT = 5;
const CLAIMS_FEED_LIMIT = 30;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ window?: string }>;
}

export default async function TopicPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { window: windowParam } = await searchParams;
  const label = slugToTopicLabel(slug);
  if (!label) notFound();

  const selected = resolveWindow(windowParam);
  const winDays = selected.days;
  const windowLabel = windowLabelFn(selected.value);

  // Pull the latest weekly AI insight for this topic in parallel with
  // the live stats. If a weekly insight exists, it replaces the
  // deterministic templates below. If not (no run yet for this slug),
  // we fall back to the templates so the page is never empty.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topicInsightModel = (prisma as any).topicInsight;
  const [allStats, recentClaims, overallStats, weeklyInsight] = await Promise.all([
    getPoliticianStatsForTopic(slug, winDays),
    getRecentClaimsForTopic(slug, winDays, CLAIMS_FEED_LIMIT),
    getPoliticianStats(winDays),
    topicInsightModel.findFirst({
      where: { slug },
      orderBy: { weekOf: "desc" },
    }) as Promise<{ weekOf: Date; body: string; label: string } | null>,
  ]);

  const ranked = allStats.filter((s) => s.totalClaims >= MIN_FOR_RANKING);
  // Ranking cards go by lie score (most misleading first); `ranked` stays
  // credibility-sorted for the accuracy insight band below.
  const byLies = [...ranked].sort(
    (a, b) => b.lieScore - a.lieScore || b.falseClaims - a.falseClaims,
  );
  const top = byLies.slice(0, TOP_BOTTOM_COUNT);
  const bottom = [...byLies].reverse().slice(0, TOP_BOTTOM_COUNT);

  // If both lists overlap (small pool), trim the bottom to politicians
  // not already in top so the reader doesn't see the same name twice.
  const topIds = new Set(top.map((s) => s.politician.id));
  const bottomDistinct = bottom.filter((s) => !topIds.has(s.politician.id));

  const totalClaims = allStats.reduce((s, x) => s + x.totalClaims, 0);
  const totalPoliticians = allStats.length;

  // === Insights ===
  // Aggregate "true %" on the topic: sum of (true + 0.5*half) across
  // ALL claims on this topic, divided by total. Treats every claim
  // equally regardless of which politician said it.
  const aggregateTrue = allStats.reduce(
    (s, x) => s + x.trueClaims + x.halfTrueClaims * 0.5,
    0,
  );
  const topicTruthPct = totalClaims > 0 ? Math.round((aggregateTrue / totalClaims) * 100) : null;

  // Site-wide raw % for comparison — same weighted formula.
  const siteTotal = overallStats.reduce((s, x) => s + x.totalClaims, 0);
  const siteTrue = overallStats.reduce(
    (s, x) => s + x.trueClaims + x.halfTrueClaims * 0.5,
    0,
  );
  const siteTruthPct = siteTotal > 0 ? Math.round((siteTrue / siteTotal) * 100) : null;
  const truthDelta =
    topicTruthPct !== null && siteTruthPct !== null ? topicTruthPct - siteTruthPct : null;

  // Verdict distribution on topic — used to narrate "shape" of the
  // week (more outright lies vs more half-truths vs mostly true).
  const verdictTotals = allStats.reduce(
    (acc, x) => ({
      true: acc.true + x.trueClaims,
      half: acc.half + x.halfTrueClaims,
      false: acc.false + x.falseClaims,
    }),
    { true: 0, half: 0, false: 0 },
  );
  const verdictShape = (() => {
    if (totalClaims === 0) return null;
    const falsePct = Math.round((verdictTotals.false / totalClaims) * 100);
    const halfPct = Math.round((verdictTotals.half / totalClaims) * 100);
    const truePct = Math.round((verdictTotals.true / totalClaims) * 100);
    return { falsePct, halfPct, truePct };
  })();

  // Dominant voice on topic — politician with the most claims here.
  const dominantVoice = ranked.length > 0 ? ranked[0] : null;
  const dominantShare =
    dominantVoice && totalClaims > 0
      ? Math.round((dominantVoice.totalClaims / totalClaims) * 100)
      : null;

  // Spread of credibility on topic — wide spread = contested terrain;
  // narrow spread = shared baseline of accuracy (or shared sources).
  const spread =
    ranked.length >= 4
      ? {
          max: ranked[0].credibilityScore,
          min: ranked[ranked.length - 1].credibilityScore,
          range: ranked[0].credibilityScore - ranked[ranked.length - 1].credibilityScore,
        }
      : null;

  // Largest discrepancy: politician whose credibility on this topic
  // differs most from their overall credibility. Only consider
  // politicians with enough sample in both. Useful insight: "politician
  // X is much better/worse on this topic than they are overall."
  const overallById = new Map(overallStats.map((s) => [s.politician.id, s]));
  const discrepancies = ranked
    .map((topicRow) => {
      const overall = overallById.get(topicRow.politician.id);
      if (!overall || overall.totalClaims < 5) return null;
      return {
        politician: topicRow.politician,
        topicScore: topicRow.credibilityScore,
        overallScore: overall.credibilityScore,
        delta: topicRow.credibilityScore - overall.credibilityScore,
        sample: topicRow.totalClaims,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const biggestStronger = discrepancies.length
    ? discrepancies.reduce((best, d) => (d.delta > best.delta ? d : best))
    : null;
  const biggestWeaker = discrepancies.length
    ? discrepancies.reduce((best, d) => (d.delta < best.delta ? d : best))
    : null;

  // Build journalist-voice paragraph list. Each paragraph fires only
  // when its underlying pattern is genuinely signal — empty topics,
  // tiny spreads, weak discrepancies all get skipped rather than
  // padded with bland sentences. Quality > quantity.
  const insightParagraphs: { heading: string; body: string }[] = [];

  if (topicTruthPct !== null && siteTruthPct !== null) {
    if (Math.abs(truthDelta ?? 0) >= 5) {
      const direction = (truthDelta ?? 0) > 0 ? "מעל" : "מתחת";
      const points = Math.abs(truthDelta ?? 0);
      insightParagraphs.push({
        heading: "המקום של הנושא במפת הדיוק",
        body:
          `ממוצע אחוז האמת המשוקלל בנושא ${label} עומד על ${topicTruthPct}%, ${points} נקודות ${direction} לממוצע האתר (${siteTruthPct}%). ` +
          ((truthDelta ?? 0) < 0
            ? `כשהשיח עובר לזירה הזו, רמת הדיוק העובדתי של הפוליטיקאים נשחקת. ${label} הוא נושא שמייצר טענות פחות מדויקות מהממוצע — בין אם בגלל אופי הדיון, הפלגנות, או היעדר נתונים זמינים שניתן לאמת.`
            : `בנושא הזה הפוליטיקאים מציגים סטנדרט גבוה מהממוצע. סביר שהדיון מבוסס על מקורות זמינים יותר, או שהציבור הקשוב לנושא דורש דיוק רב יותר.`),
      });
    } else {
      insightParagraphs.push({
        heading: "המקום של הנושא במפת הדיוק",
        body:
          `אחוז האמת המשוקלל בנושא ${label} הוא ${topicTruthPct}%, סמוך לממוצע האתר של ${siteTruthPct}%. ` +
          `כשפוליטיקאים מדברים על ${label}, רמת הדיוק שלהם דומה לזו שהם מציגים בשאר התחומים.`,
      });
    }
  }

  if (dominantVoice && dominantShare !== null && dominantShare >= 20 && ranked.length >= 2) {
    const g = genderOf(dominantVoice.politician.id);
    const nameMark = markPolitician(dominantVoice.politician.id, dominantVoice.politician.name);
    insightParagraphs.push({
      heading: "מי מוביל את השיח",
      body:
        `${nameMark} (${dominantVoice.politician.party}) ${pronoun(g, "subject")} הקול הדומיננטי בנושא ${label} בחלון הזה: ${dominantVoice.totalClaims} טענות, ${dominantShare}% מסך הטענות בנושא. ` +
        `הציון ${pronoun(g, "possessive")} בנושא ${pronoun(g, "subject")} ${dominantVoice.credibilityScore}% (${dominantVoice.truthPercentage}% אחוז אמת גולמי). ` +
        `כשפוליטיקאי בודד מייצר נתח כה משמעותי מהדיון, רמת הדיוק ${pronoun(g, "possessive")} צובעת בפועל את כל הנושא.`,
    });
  }

  if (verdictShape && totalClaims >= 8) {
    if (verdictShape.falsePct >= 25 && verdictShape.falsePct > verdictShape.halfPct) {
      insightParagraphs.push({
        heading: "צורת השקרים בנושא",
        body:
          `${verdictTotals.false} מתוך ${totalClaims} הטענות בנושא ${label} סווגו שקריות (${verdictShape.falsePct}%), לעומת ${verdictTotals.half} בלבד שסווגו חצי-אמת. ` +
          `כשפוליטיקאים שוגים בנושא ${label}, הם נוטים לטעון דברים שגויים לחלוטין יותר מאשר להטעות באופן חלקי. שגיאה בולטת יותר מהטעיה זהירה.`,
      });
    } else if (verdictShape.halfPct >= 30) {
      insightParagraphs.push({
        heading: "צורת השקרים בנושא",
        body:
          `${verdictTotals.half} מתוך ${totalClaims} הטענות בנושא ${label} סווגו חצי-אמת (${verdictShape.halfPct}%). ` +
          `הדפוס הזה מצביע על נטייה לכופף את האמת לצרכים פוליטיים יותר מאשר לטעון דברים שגויים לחלוטין. הטעיה זהירה דורשת מיומנות אחרת משקר.`,
      });
    }
  }

  if (biggestStronger && biggestStronger.delta >= 15) {
    const g = genderOf(biggestStronger.politician.id);
    const nameMark = markPolitician(biggestStronger.politician.id, biggestStronger.politician.name);
    insightParagraphs.push({
      heading: `${biggestStronger.politician.name} ${verb(g, "בולט", "בולטת")} לטובה`,
      body:
        `${nameMark} (${biggestStronger.politician.party}) ${verb(g, "מקבל", "מקבלת")} ${biggestStronger.topicScore}% בנושא ${label}, לעומת ${biggestStronger.overallScore}% בלבד בציון הכללי ${pronoun(g, "possessive")}. ` +
        `פער של ${biggestStronger.delta} נקודות. בנושא הזה ${pronoun(g, "subject")} ${verb(g, "מציג", "מציגה")} סטנדרט שונה משאר התחומים. סביר שזו זירת התמחות ${pronoun(g, "possessive")}, או ש${pronoun(g, "subject")} ${verb(g, "נמנע", "נמנעת")} מטענות ש${verb(g, "אינו יכול", "אינה יכולה")} לאמת.`,
    });
  }

  if (
    biggestWeaker &&
    biggestWeaker.delta <= -15 &&
    biggestWeaker.politician.id !== biggestStronger?.politician.id
  ) {
    const g = genderOf(biggestWeaker.politician.id);
    const nameMark = markPolitician(biggestWeaker.politician.id, biggestWeaker.politician.name);
    insightParagraphs.push({
      heading: `${biggestWeaker.politician.name} ${verb(g, "בולט", "בולטת")} לרעה`,
      body:
        `${nameMark} (${biggestWeaker.politician.party}) ${verb(g, "מקבל", "מקבלת")} ${biggestWeaker.topicScore}% בנושא ${label}, לעומת ${biggestWeaker.overallScore}% בציון הכללי ${pronoun(g, "possessive")}. ` +
        `כש${pronoun(g, "subject")} ${verb(g, "נכנס", "נכנסת")} לנושא הזה, רמת הדיוק ${pronoun(g, "possessive")} צונחת ב-${Math.abs(biggestWeaker.delta)} נקודות. או שזו זירה שמושכת ${pronoun(g, "from")} הצהרות שאינן עומדות במבחן, או ש${pronoun(g, "subject")} ${verb(g, "מסתמך", "מסתמכת")} על מקורות פחות מהימנים כש${pronoun(g, "subject")} ${verb(g, "מדבר", "מדברת")} עליה.`,
    });
  }

  if (spread && spread.range >= 40) {
    insightParagraphs.push({
      heading: "טווח רחב של דיוק",
      body:
        `הפוליטיקאים שדנו ב-${label} נעים מ-${spread.min}% ל-${spread.max}% דיוק, פער של ${spread.range} נקודות. ` +
        `כאשר הפער בין הקול המדויק ביותר לבין הפחות מדויק כל כך רחב, מדובר בנושא שאין בו "אמת אחת" שכולם נצמדים אליה. בחירת המקור משפיעה על כל מה שמשתמע מהדיון.`,
    });
  }

  // Serialize for the ClaimCard client component.
  const serializedClaims = recentClaims.map((c) => ({
    id: c.id,
    politicianId: c.politicianId,
    quote: c.quote,
    verdict: c.verdict as Verdict,
    summary: c.summary,
    explanation: c.explanation,
    source: c.source,
    sourceUrl: c.sourceUrl,
    factSource: c.factSource,
    factSourceUrl: c.factSourceUrl,
    editorApproved: c.editorApproved,
    verifierNotes: c.verifierNotes,
    date: c.date.toISOString().split("T")[0],
    topic: c.topic,
    _politician: {
      id: c.politician.id,
      name: c.politician.name,
      party: c.politician.party,
      image: c.politician.image,
    },
    _commentCount: c._count.comments,
  })) satisfies (Claim & {
    _politician?: { id: string; name: string; party: string; image: string | null };
    _commentCount?: number;
  })[];

  return (
    <div>
      <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-2">
        נושא · {windowLabel}
      </div>
      <div className="flex items-baseline justify-between gap-4 mb-3 flex-wrap">
        <h1 className="text-4xl font-black tracking-tight">{label}</h1>
        <ShareButtons
          text={shareTextForRanking(
            `${label} · מי מטעה הכי הרבה`,
            top.map((s) => ({ name: s.politician.name, score: s.lieScore })),
            5,
          )}
          url={`${SITE_URL}/topic/${slug}`}
        />
      </div>
      <p className="text-sm text-foreground-muted mb-6 max-w-2xl leading-relaxed">
        ניקוד הטעיה של פוליטיקאים בנושא {label}.{" "}
        {totalClaims > 0 ? (
          <>
            <span className="text-foreground font-bold">{totalClaims} טענות</span>{" "}
            של <span className="text-foreground font-bold">{totalPoliticians} פוליטיקאים</span> נבדקו{" "}
            {windowLabel === "מכל הזמנים" ? "בכל הזמנים" : `ב-${windowLabel}`}.
          </>
        ) : (
          <>אין מספיק נתונים בנושא הזה בחלון הזמן שנבחר.</>
        )}
      </p>

      <div className="mb-6">
        <WindowSelector basePath={`/topic/${slug}`} selectedValue={selected.value} />
      </div>

      {/* Insights band. Two surfaces, in priority order:
          1. WEEKLY AI insight — single journalist-voice analysis,
             generated each Friday via the weekly cron. AI-narrated,
             richer than the templates. Refreshed once a week so the
             same reader sees stable content (vs the live templates
             that recompute every render).
          2. FALLBACK deterministic templates — fire when no weekly
             insight exists yet for this topic. Computed live from
             current stats. Same patterns as before. */}
      {weeklyInsight ? (
        <article
          className="bg-card border border-border-strong overflow-hidden mb-8"
          style={{ borderRadius: 4 }}
        >
          <div className="px-5 py-3.5 border-b border-border">
            <h2 className="font-black text-base tracking-tight">תובנות שבועיות בנושא {label}</h2>
            <div className="text-[10px] uppercase tracking-wider text-foreground-muted mt-0.5">
              עודכן {weeklyInsight.weekOf.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })} · מתעדכן כל שבוע
            </div>
          </div>
          <div className="p-6">
            <InsightBody body={weeklyInsight.body} />
          </div>
        </article>
      ) : insightParagraphs.length > 0 && (
        <article
          className="bg-card border border-border-strong overflow-hidden mb-8"
          style={{ borderRadius: 4 }}
        >
          <div className="px-5 py-3.5 border-b border-border">
            <h2 className="font-black text-base tracking-tight">מה הנתונים מספרים על נושא זה</h2>
          </div>
          <div className="p-6 space-y-6">
            {insightParagraphs.map((p, i) => (
              <section key={i}>
                <h3 className="font-black text-sm tracking-tight mb-2">{p.heading}</h3>
                <InsightBody body={p.body} />
              </section>
            ))}
          </div>
        </article>
      )}

      {ranked.length === 0 ? (
        <div
          className="bg-card border border-border-strong p-6 text-center"
          style={{ borderRadius: 4 }}
        >
          <p className="text-sm text-foreground-muted">
            אין פוליטיקאים עם {MIN_FOR_RANKING}+ טענות בנושא הזה בחלון הזמן שנבחר.{" "}
            <a href={`/topic/${slug}?window=90`} className="underline hover:no-underline font-bold">
              נסו חלון של 3 חודשים ←
            </a>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
          <RankCard
            title="הכי מטעים בנושא"
            stats={top}
            tone="negative"
          />
          {bottomDistinct.length > 0 && (
            <RankCard
              title="הכי מדייקים בנושא"
              stats={bottomDistinct}
              tone="positive"
            />
          )}
        </div>
      )}

      {serializedClaims.length > 0 && (
        <section className="mb-10">
          <div className="flex items-baseline justify-between mb-5 pb-3 border-b-[1.5px] border-border-strong">
            <h2 className="font-black text-xl tracking-tight">
              טענות אחרונות בנושא {label}
            </h2>
            <span className="text-[11px] uppercase tracking-wider text-foreground-muted tabular-nums">
              {serializedClaims.length} טענות
            </span>
          </div>
          <div className="space-y-4">
            {serializedClaims.map((claim) => (
              <ClaimCard key={claim.id} claim={claim} />
            ))}
          </div>
        </section>
      )}

      <OtherTopicsNav currentSlug={slug} />
    </div>
  );
}

function RankCard({
  title,
  stats,
  tone,
}: {
  title: string;
  stats: {
    politician: { id: string; name: string; party: string; image: string | null };
    totalClaims: number;
    truthPercentage: number;
    lieScore: number;
  }[];
  tone: "positive" | "negative";
}) {
  const accentColor = tone === "positive" ? "var(--verdict-true)" : "var(--verdict-false)";
  return (
    <div
      className="bg-card border border-border-strong overflow-hidden"
      style={{ borderRadius: 4 }}
    >
      <div className="px-5 py-3.5 border-b border-border">
        <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: accentColor }}>
          {title}
        </div>
      </div>
      <ol>
        {stats.map((stat, i) => (
          <li key={stat.politician.id} className="border-b border-border last:border-b-0">
            <Link
              href={`/politician/${stat.politician.id}`}
              className="flex items-center gap-3 px-5 py-2.5 hover:bg-muted/40 transition-colors"
            >
              <span className="text-sm font-black text-foreground-muted w-5 tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <PoliticianAvatar
                id={stat.politician.id}
                name={stat.politician.name}
                image={stat.politician.image}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{stat.politician.name}</div>
                <div className="text-[11px] text-foreground-muted truncate">{stat.politician.party}</div>
              </div>
              <div className="text-left shrink-0">
                <div
                  className="font-black text-base tabular-nums leading-none"
                  style={{ color: accentColor }}
                  title={`ניקוד הטעיה: ${stat.lieScore} (שקר=1, חצי=0.5). ${stat.truthPercentage}% אמת מתוך ${stat.totalClaims} טענות.`}
                >
                  {stat.lieScore}
                </div>
                <div className="text-[10px] tabular-nums text-foreground-muted mt-0.5">
                  {stat.totalClaims} טענות
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

function OtherTopicsNav({ currentSlug }: { currentSlug: string }) {
  const others = listCanonicalTopics().filter((t) => t.slug !== currentSlug);
  return (
    <section className="pt-6 border-t border-border">
      <div className="text-[11px] uppercase tracking-wider text-foreground-muted font-bold mb-3">
        עוד נושאים
      </div>
      <div className="flex flex-wrap gap-2">
        {others.map((t) => (
          <Link
            key={t.slug}
            href={`/topic/${t.slug}`}
            className="text-xs px-3 py-1.5 bg-card border border-border hover:border-foreground-muted hover:bg-muted/40 transition-colors"
            style={{ borderRadius: 2 }}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

