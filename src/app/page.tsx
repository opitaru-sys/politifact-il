import { Suspense } from "react";
import {
  getPoliticianStats,
  getAllPoliticiansLite,
  getKnessetActivityMap,
  getMostMentionedPoliticians,
} from "@/lib/data";
import { getDataCollectionStart } from "@/lib/queries";
import { getTopTopicsForWindow } from "@/lib/topic-stats";
import { LiarOfTheWeek } from "@/components/LiarOfTheWeek";
import { LeaderboardPreview } from "@/components/LeaderboardPreview";
import { InHeadlinesStrip } from "@/components/InHeadlinesStrip";
import { DigestHighlights } from "@/components/DigestHighlights";
import { TopicHighlights } from "@/components/TopicHighlights";
import { SearchBar } from "@/components/SearchBar";
import { FeedFilters } from "@/components/FeedFilters";
import { WindowSelector } from "@/components/WindowSelector";
import { RecentClaimsFeed } from "@/components/RecentClaimsFeed";
import { FeedSkeleton } from "@/components/FeedSkeleton";
import { resolveWindow, windowLabel } from "@/lib/window";
import { topicDisplayLabel } from "@/lib/topics";

export const dynamic = "force-dynamic";

// Canonical points to the bare homepage so every filtered variation
// (?topic=, ?politician=, ?window=) doesn't create duplicate-content URLs.
// Also re-declare RSS types — page-level `alternates` replaces (not merges)
// the root layout's alternates, so we carry forward what we need.
export const metadata = {
  alternates: {
    canonical: "/",
    types: {
      "application/rss+xml": [{ url: "/feed.xml", title: "בדוק · פסקי דין אחרונים" }],
    },
  },
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; politician?: string; window?: string }>;
}) {
  const sp = await searchParams;
  const activeTopic = sp.topic?.trim() || null;
  const activePolitician = sp.politician?.trim() || null;

  // Single global window — controls stats (hero + leaderboard preview)
  // AND the recent-claims feed below. Previously had a separate
  // `?days=` param for the feed, but the duplicated selector confused
  // visitors ("why are the two different?"). One filter, everything
  // moves together.
  const statsWindow = resolveWindow(sp.window);
  const activeDays = statsWindow.days;

  // Light queries above the fold — these all return small payloads
  // (stats are aggregates, politicians-lite is id+name+image, the
  // collection-start is one row). The heavy `getRecentClaims` call
  // is now inside `<Suspense>` below so a slow feed query doesn't
  // block the masthead/hero/leaderboard from streaming in.
  console.time("page.parallel-queries");
  const [stats, allPoliticians, collectionStart, activityMap, mostMentioned, topTopics] = await Promise.all([
    (async () => {
      console.time("page.getPoliticianStats");
      const r = await getPoliticianStats(statsWindow.days);
      console.timeEnd("page.getPoliticianStats");
      return r;
    })(),
    (async () => {
      console.time("page.getAllPoliticiansLite");
      const r = await getAllPoliticiansLite();
      console.timeEnd("page.getAllPoliticiansLite");
      return r;
    })(),
    (async () => {
      console.time("page.getDataCollectionStart");
      const r = await getDataCollectionStart();
      console.timeEnd("page.getDataCollectionStart");
      return r;
    })(),
    (async () => {
      console.time("page.getKnessetActivityMap");
      const r = await getKnessetActivityMap();
      console.timeEnd("page.getKnessetActivityMap");
      return r;
    })(),
    (async () => {
      console.time("page.getMostMentionedPoliticians");
      const r = await getMostMentionedPoliticians(statsWindow.days, 8);
      console.timeEnd("page.getMostMentionedPoliticians");
      return r;
    })(),
    (async () => {
      console.time("page.getTopTopicsForWindow");
      const r = await getTopTopicsForWindow(statsWindow.days, 5);
      console.timeEnd("page.getTopTopicsForWindow");
      return r;
    })(),
  ]);
  console.timeEnd("page.parallel-queries");

  const politicianFilterLabel = activePolitician
    ? allPoliticians.find((p) => p.id === activePolitician)?.name ?? activePolitician
    : null;

  const hasFilter = Boolean(activeTopic || activePolitician || statsWindow.value !== "30");

  // Suspense reset key: when `?window=`, `?topic=` or `?politician=`
  // changes, React must unmount the previous feed and re-show the
  // skeleton. Without a `key` React would keep showing stale cards
  // until the new query resolved — exactly the slow-feeling
  // behaviour we're fixing.
  const feedKey = `${activeDays}-${activeTopic ?? ""}-${activePolitician ?? ""}`;

  return (
    <div className="space-y-10">
      {/* Editorial masthead intro. The "תובנות השבוע" entry point used
          to live as a faint chip in this eyebrow — it's now featured
          prominently as the DigestHighlights card below and as a
          first-class nav link, so the masthead can return to a clean
          date stamp. */}
      <section className="pt-1 pb-2">
        <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-3">
          עודכן · {new Date().toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}
        </div>
        <h1 className="text-4xl md:text-5xl font-black leading-[1.05] tracking-tight max-w-3xl">
          {/* "אמין" used to be coloured with the verdict-true green, which
              read like a UI badge rather than a headline word. Underlined
              in press-red instead — more editorial, less verdict-y. */}
          מי הכי{" "}
          <span
            style={{
              textDecoration: "underline",
              textDecorationColor: "var(--accent)",
              textDecorationThickness: "3px",
              textUnderlineOffset: "8px",
            }}
          >
            מטעה
          </span>{" "}
          בפוליטיקה
          <span className="text-accent">.</span>
        </h1>
        <p className="text-sm md:text-base text-foreground-muted mt-3 leading-relaxed">
          בדיקת עובדות לכל טענה ציבורית של פוליטיקאי ישראלי. ציטוט מקורי, פסק דין מנומק, וקישור לכתבה המקורית.
        </p>
      </section>

      {/* Global window selector — controls the hero, leaderboard preview,
          AND the recent-claims feed below. One toggle moves everything.
          The "תקופה" label and explanatory subtext were removed: the
          chip labels (יום / שבוע / חודש / etc.) are self-evidently a
          time filter, and the explanatory line was visual noise. */}
      <div className="flex justify-end">
        <WindowSelector basePath="/" selectedValue={statsWindow.value} extraParams={{ topic: sp.topic ?? "", politician: sp.politician ?? "" }} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <LiarOfTheWeek stats={stats} windowDays={statsWindow.days} activityMap={activityMap} />
        <LeaderboardPreview stats={stats} windowDays={statsWindow.days} activityMap={activityMap} />
      </div>

      {/* DigestHighlights — flagship editorial surface. Renders the
          latest published digest's title + lead insight headings.
          BiggestMovers used to live in this slot but was retired
          for being "boring data" once the journalist-voice digest
          shipped — the insights ARE the interesting thing. Returns
          null until a digest is published. */}
      <DigestHighlights />

      {/* TopicHighlights — top canonical topics in the active window
          with truth % per topic. Discovery surface for /topics +
          /topic/[slug]. Replaces the second half of the BiggestMovers
          slot. */}
      <TopicHighlights topics={topTopics} windowDays={statsWindow.days} />

      {/* "מי בכותרות" strip — top politicians by raw claim count in the
          active window. Solves the "first-time visitor doesn't see the
          household names" UX problem. Pure volume sort, no editorial
          curation. Famous politicians naturally dominate because they
          generate the most news coverage. Credibility score travels
          with each face as a color chip so the methodology stays visible.

          The compact search input is co-located right below the strip so
          a visitor who doesn't see the politician they're after has a
          one-click escape hatch. */}
      <div className="space-y-3">
        <InHeadlinesStrip stats={mostMentioned} windowDays={statsWindow.days} />
        <SearchBar politicians={allPoliticians} compact />
      </div>

      {/* One-line legend — was a 4-line block before the home refactor.
          The full methodology lives at /about; here we just anchor the
          one term that needs explaining ("ציון דיוק עובדתי") and the data-
          coverage caveat. Hover the score anywhere on the site for the
          formula tooltip. */}
      {collectionStart && (
        <div className="text-[11px] text-foreground-muted text-center leading-relaxed">
          איסוף הנתונים מ-
          <strong className="text-foreground tabular-nums">
            {collectionStart.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}
          </strong>
          {" · "}
          {windowLabel(statsWindow.value)}: {stats.reduce((s, x) => s + x.totalClaims, 0)} טענות
          <span className="mx-2 opacity-40">·</span>
          <strong className="text-foreground">ניקוד הטעיה</strong> = שקר ×1 + חצי-אמת ×0.5.{" "}
          <a href="/about" className="underline hover:no-underline">איך מחושב? ←</a>
        </div>
      )}

      <section>
        <div className="flex items-baseline justify-between mb-3 pb-3 border-b-[1.5px] border-border-strong gap-3 flex-wrap">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h2 className="font-black text-xl tracking-tight">
              {activeTopic ? "טענות בנושא" : activePolitician ? "טענות של" : "טענות אחרונות"}
            </h2>
            {activeTopic && (
              <a
                href={buildHref({ topic: null, politician: activePolitician, window: statsWindow.value })}
                className="inline-flex items-center gap-2 text-xs bg-accent text-background px-2.5 py-1 hover:bg-accent-dark transition-colors font-bold max-w-[16rem]"
                style={{ borderRadius: 2 }}
                title={`הסר סינון נושא: ${activeTopic}`}
              >
                <span className="truncate">{topicDisplayLabel(activeTopic)}</span>
                <span aria-hidden="true" className="text-base leading-none shrink-0">×</span>
              </a>
            )}
            {activePolitician && politicianFilterLabel && (
              <a
                href={buildHref({ topic: activeTopic, politician: null, window: statsWindow.value })}
                className="inline-flex items-center gap-2 text-xs bg-accent text-background px-2.5 py-1 hover:bg-accent-dark transition-colors font-bold"
                style={{ borderRadius: 2 }}
                title="הסר סינון פוליטיקאי"
              >
                <span>{politicianFilterLabel}</span>
                <span aria-hidden="true" className="text-base leading-none">×</span>
              </a>
            )}
          </div>
        </div>

        <FeedFilters
          activePolitician={activePolitician}
          activeTopic={activeTopic}
          activeWindow={statsWindow.value}
          politicians={allPoliticians}
        />

        {/* Suspense boundary scoped to just the feed. The `key` forces
            React to unmount the previous feed on any filter change so
            the skeleton reappears — without it React keeps the stale
            cards visible until the new query resolves, which is the
            "feels frozen" sensation we're fixing. */}
        <div className="mt-5">
          <Suspense key={feedKey} fallback={<FeedSkeleton count={5} />}>
            <RecentClaimsFeed
              activeDays={activeDays}
              activeTopic={activeTopic}
              activePolitician={activePolitician}
              windowValue={statsWindow.value}
              hasFilter={hasFilter}
            />
          </Suspense>
        </div>
      </section>
    </div>
  );
}

function buildHref(params: { topic: string | null; politician: string | null; window?: string }): string {
  const sp = new URLSearchParams();
  if (params.topic) sp.set("topic", params.topic);
  if (params.politician) sp.set("politician", params.politician);
  if (params.window && params.window !== "30") sp.set("window", params.window);
  const qs = sp.toString();
  return qs ? `/?${qs}` : "/";
}
