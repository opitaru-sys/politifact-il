import { Suspense } from "react";
import {
  getPoliticianStats,
  getAllPoliticiansLite,
  getKnessetActivityMap,
  getPartyStats,
  getMostMentionedPoliticians,
} from "@/lib/data";
import { getDataCollectionStart } from "@/lib/queries";
import { getBiggestMovers } from "@/lib/cred-history";
import { LiarOfTheWeek } from "@/components/LiarOfTheWeek";
import { LeaderboardPreview } from "@/components/LeaderboardPreview";
import { PartiesPreview } from "@/components/PartiesPreview";
import { InHeadlinesStrip } from "@/components/InHeadlinesStrip";
import { BiggestMovers } from "@/components/BiggestMovers";
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
  const [stats, allPoliticians, collectionStart, activityMap, partyStats, mostMentioned, movers] = await Promise.all([
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
      console.time("page.getPartyStats");
      const r = await getPartyStats(statsWindow.days);
      console.timeEnd("page.getPartyStats");
      return r;
    })(),
    (async () => {
      console.time("page.getMostMentionedPoliticians");
      const r = await getMostMentionedPoliticians(statsWindow.days, 8);
      console.timeEnd("page.getMostMentionedPoliticians");
      return r;
    })(),
    (async () => {
      console.time("page.getBiggestMovers");
      // 7-day movers, min sample 15 in both windows. The card renders
      // null if there aren't enough movers to be substantive.
      const r = await getBiggestMovers({ daysBack: 7, minSample: 15, topN: 3 });
      console.timeEnd("page.getBiggestMovers");
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
        <LiarOfTheWeek stats={stats} windowDays={statsWindow.days} activityMap={activityMap} />
        <LeaderboardPreview stats={stats} windowDays={statsWindow.days} activityMap={activityMap} />
      </div>

      {/* Biggest movers — credibility delta over the last 7 days, top 3
          gainers + top 3 losers side by side. Self-hides if there aren't
          enough eligible politicians (min 15 claims in both anchor
          windows) to be substantive. Powered by pre-baked
          CredibilitySnapshot rows so the read is one cheap query. */}
      <BiggestMovers gainers={movers.gainers} losers={movers.losers} daysBack={7} />

      {/* Parties preview — third dimension (aggregated by faction).
          Full width below the hero+leaderboard duo so the 3-color
          verdict bar has room to read at a glance. */}
      <PartiesPreview stats={partyStats} windowDays={statsWindow.days} />

      {/* "מי בכותרות" strip — top politicians by raw claim count in the
          active window. Solves the "first-time visitor doesn't see the
          household names" UX problem. Pure volume sort, no editorial
          curation. Famous politicians naturally dominate because they
          generate the most news coverage. Credibility score travels
          with each face as a color chip so the methodology stays visible. */}
      <InHeadlinesStrip stats={mostMentioned} windowDays={statsWindow.days} />

      {/* Discovery zone: prominent search bar for visitors who have a
          specific politician in mind. Moved up from below the feed
          (was buried). Pairs with the "מי בכותרות" strip above as a
          natural "find what you came for" block. */}
      <section
        className="bg-card border-[1.5px] border-border-strong p-5 sm:p-6"
        style={{ borderRadius: 4 }}
      >
        <div className="text-[10px] tracking-[0.25em] uppercase font-bold text-accent mb-3">
          לא מצאתם את מי שחיפשתם?
        </div>
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-3">
          חפשו פוליטיקאי
        </h2>
        <p className="text-xs text-foreground-muted mb-4 leading-relaxed">
          הקלידו שם או מפלגה — נתאים מבין {allPoliticians.length} חברי כנסת ואישי ציבור במאגר.
        </p>
        <SearchBar politicians={allPoliticians} />
      </section>

      {/* "Data since DATE" + inline legend — one compact micro-caption
          under the hero+leaderboard duo. Replaces the previous full-
          width legend card which was eating too much above-the-fold
          space. The metric labels in the cards above use the same
          terms (אמינות / נוכחות), so anchoring them here once is
          enough — no need to repeat in every card. */}
      {collectionStart && (
        <div className="text-[11px] text-foreground-muted text-center leading-relaxed -mt-3 space-y-1">
          <div>
            איסוף הנתונים מתחיל ב-
            <strong className="text-foreground tabular-nums">
              {collectionStart.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}
            </strong>
            . {windowLabel(statsWindow.value)} מבוסס על {stats.reduce((s, x) => s + x.totalClaims, 0)} טענות.
          </div>
          <div className="opacity-90">
            <strong className="text-foreground">ציון אמינות</strong> = אחוז אמת מתוקנן לגודל מדגם (Wilson 95%)
            <span className="mx-2 opacity-40">·</span>
            <strong className="text-foreground">נוכחות</strong> = % ישיבות מליאה שדיבר בהן ב-90 ימים
          </div>
          <div className="opacity-80 text-[10px]">
            פוליטיקאי עם 3 טענות נכונות מקבל ציון נמוך יותר מפוליטיקאי עם 30 טענות נכונות, גם אם שניהם ב-100% גולמי.
            האחוז הגולמי <strong className="text-foreground">(אמת + ½ × חצי) ÷ סה״כ</strong> מוצג כקו תחתון.
          </div>
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
