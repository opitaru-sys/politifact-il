/**
 * Index of all canonical topics — the entry point for the /topic/[slug]
 * pages. Lives at /topics and is linked from the global header nav.
 *
 * Before this page existed, the topic landing pages were effectively
 * orphaned — only discoverable via the per-politician TopicBreakdown
 * card (which itself only appears for politicians with enough data).
 * The user couldn't find them. This page solves the "I'd never guess
 * these were clickable" problem.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { listCanonicalTopics, rawTopicMatchesSlug } from "@/lib/topics";
import { WindowSelector } from "@/components/WindowSelector";
import { resolveWindow, windowLabel as windowLabelFn } from "@/lib/window";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "כל הנושאים | בדוק",
  description:
    "דיוק עובדתי של פוליטיקאים ישראליים לפי נושא: ביטחון, כלכלה, משפט, חינוך, בריאות ועוד. דירוג מתוקנן לגודל מדגם.",
  alternates: { canonical: "/topics" },
};

interface PageProps {
  searchParams: Promise<{ window?: string }>;
}

export default async function TopicsIndexPage({ searchParams }: PageProps) {
  const { window: windowParam } = await searchParams;
  const selected = resolveWindow(windowParam);
  const cutoff =
    selected.days !== undefined ? new Date(Date.now() - selected.days * 24 * 60 * 60 * 1000) : null;

  // Single query to count claims per canonical topic. Loading all
  // approved claims in the window (capped at 5000) is cheap; we group
  // in memory using the same regex matchers as everywhere else.
  const claims = await prisma.claim.findMany({
    where: {
      status: "published",
      editorApproved: true,
      ...(cutoff ? { date: { gte: cutoff } } : {}),
    },
    select: {
      verdict: true,
      topic: true,
      politicianId: true,
    },
    take: 5000,
  });

  const topics = listCanonicalTopics();
  const rows = topics.map(({ slug, label }) => {
    const topicClaims = claims.filter((c) => rawTopicMatchesSlug(c.topic, slug));
    const politicianIds = new Set(topicClaims.map((c) => c.politicianId));
    const trueClaims = topicClaims.filter((c) => c.verdict === "true").length;
    const halfTrue = topicClaims.filter((c) => c.verdict === "half-true").length;
    const totalC = topicClaims.length;
    const weighted = trueClaims + halfTrue * 0.5;
    const truthPct = totalC > 0 ? Math.round((weighted / totalC) * 100) : null;
    return {
      slug,
      label,
      totalClaims: totalC,
      politicianCount: politicianIds.size,
      truthPercentage: truthPct,
    };
  });

  // Sort by claim count desc — most-discussed topics surface first.
  // Empty topics drop to the bottom but still appear (so the reader
  // sees the full taxonomy + understands why some pages are sparse).
  rows.sort((a, b) => b.totalClaims - a.totalClaims);

  const windowLabel = windowLabelFn(selected.value);

  return (
    <div>
      <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-2">
        נושאים · {windowLabel}
      </div>
      <h1 className="text-4xl font-black mb-3 tracking-tight">כל הנושאים</h1>
      <p className="text-sm text-foreground-muted mb-6 max-w-2xl leading-relaxed">
        דיוק פוליטיקאים לפי תחום. כל נושא הוא דף עם דירוג עצמאי, טענות אחרונות,
        והפוליטיקאים הכי מדויקים ופחות מדויקים בו. ההתאמה לקטגוריה מבוססת מילות מפתח —
        טענה אחת יכולה להופיע רק תחת קטגוריה אחת.
      </p>

      <div className="mb-6">
        <WindowSelector basePath="/topics" selectedValue={selected.value} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map((r) => (
          <Link
            key={r.slug}
            href={`/topic/${r.slug}`}
            className={`bg-card border border-border-strong p-5 hover:border-foreground-muted hover:bg-muted/40 transition-colors block ${
              r.totalClaims === 0 ? "opacity-60" : ""
            }`}
            style={{ borderRadius: 4 }}
          >
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <h2 className="font-black text-lg tracking-tight">{r.label}</h2>
              {r.truthPercentage !== null && (
                <span
                  className="text-xs font-bold tabular-nums"
                  style={{
                    color:
                      r.truthPercentage < 40
                        ? "var(--verdict-false)"
                        : r.truthPercentage < 60
                        ? "var(--verdict-half)"
                        : "var(--verdict-true)",
                  }}
                  title="אחוז האמת הגולמי הממוצע על פני כל הטענות בנושא"
                >
                  {r.truthPercentage}% אמת
                </span>
              )}
            </div>
            <div className="text-[11px] text-foreground-muted tabular-nums">
              {r.totalClaims > 0 ? (
                <>
                  <strong className="text-foreground">{r.totalClaims}</strong> טענות{" "}
                  · <strong className="text-foreground">{r.politicianCount}</strong> פוליטיקאים
                </>
              ) : (
                <span className="italic">אין טענות בחלון הזה</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
