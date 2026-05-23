import { Suspense } from "react";
import { getPoliticianStats, getAllPoliticiansLite } from "@/lib/data";
import { getDataCollectionStart } from "@/lib/queries";
import { LiarOfTheWeek } from "@/components/LiarOfTheWeek";
import { LeaderboardPreview } from "@/components/LeaderboardPreview";
import { SearchBar } from "@/components/SearchBar";
import { FeedFilters } from "@/components/FeedFilters";
import { WindowSelector } from "@/components/WindowSelector";
import { RecentClaimsFeed } from "@/components/RecentClaimsFeed";
import { FeedSkeleton } from "@/components/FeedSkeleton";
import { resolveWindow, windowLabel } from "@/lib/window";
import { topicDisplayLabel } from "@/lib/topics";

export const dynamic = "force-dynamic";

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
  const [stats, allPoliticians, collectionStart] = await Promise.all([
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
      {/* Editorial masthead intro */}
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
            אמין
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
        <LiarOfTheWeek stats={stats} windowDays={statsWindow.days} />
        <LeaderboardPreview stats={stats} windowDays={statsWindow.days} />
      </div>

      {/* "Data since DATE" — anchors visitors so they understand the
          temporal coverage of the dataset. Shown right under the
          hero+leaderboard duo for visibility. */}
      {collectionStart && (
        <div className="text-[11px] text-foreground-muted text-center -mt-3">
          איסוף הנתונים מתחיל ב-
          <strong className="text-foreground tabular-nums">
            {collectionStart.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}
          </strong>
          . {windowLabel(statsWindow.value)} מבוסס על {stats.reduce((s, x) => s + x.totalClaims, 0)} טענות.
        </div>
      )}

      <SearchBar politicians={allPoliticians} />

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
