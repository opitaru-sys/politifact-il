import Link from "next/link";
import { getRecentClaims, getPoliticianStats, getAllPoliticiansLite } from "@/lib/data";
import { getDataCollectionStart } from "@/lib/queries";
import { LiarOfTheWeek } from "@/components/LiarOfTheWeek";
import { ClaimCard } from "@/components/ClaimCard";
import { LeaderboardPreview } from "@/components/LeaderboardPreview";
import { SearchBar } from "@/components/SearchBar";
import { FeedFilters } from "@/components/FeedFilters";
import { WindowSelector } from "@/components/WindowSelector";
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

  const [allRecent, stats, allPoliticians, collectionStart] = await Promise.all([
    getRecentClaims(activeDays),
    getPoliticianStats(statsWindow.days),
    getAllPoliticiansLite(),
    getDataCollectionStart(),
  ]);

  let recentClaims = allRecent;
  if (activeTopic) recentClaims = recentClaims.filter((c) => c.topic === activeTopic);
  if (activePolitician) recentClaims = recentClaims.filter((c) => c.politicianId === activePolitician);

  const politicianFilterLabel = activePolitician
    ? allPoliticians.find((p) => p.id === activePolitician)?.name ?? activePolitician
    : null;

  const hasFilter = activeTopic || activePolitician || statsWindow.value !== "30";

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
        <p className="text-sm md:text-base text-foreground-muted max-w-2xl mt-3 leading-relaxed">
          בדיקת עובדות לכל טענה ציבורית של פוליטיקאי ישראלי. ציטוט מקורי, פסק דין מנומק, וקישור לכתבה המקורית.
        </p>
      </section>

      {/* Stats-window selector — applies to both the hero card AND the
          leaderboard preview, since both pull from `stats`. The two
          cards next to it always share the same denominator. */}
      {/* Global window selector — controls the hero, leaderboard preview,
          AND the recent-claims feed below. One toggle moves everything. */}
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h2 className="text-[11px] tracking-[0.3em] uppercase text-foreground-muted font-bold">
            תקופה
          </h2>
          <span className="text-[11px] text-foreground-muted">
            הסינון משפיע על כל הנתונים בעמוד
          </span>
        </div>
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
          <span className="text-[11px] tracking-wider uppercase text-foreground-muted tabular-nums">
            {recentClaims.length} טענות · {windowLabel(statsWindow.value)}
          </span>
        </div>

        <FeedFilters
          activePolitician={activePolitician}
          activeTopic={activeTopic}
          activeWindow={statsWindow.value}
          politicians={allPoliticians}
        />

        {recentClaims.length === 0 ? (
          <div className="bg-card border border-border p-8 mt-5 text-center text-foreground-muted text-sm" style={{ borderRadius: 4 }}>
            לא נמצאו טענות התואמות את הסינון {windowLabel(statsWindow.value)}.
            {hasFilter && (
              <div className="mt-3">
                <Link href="/" className="text-accent hover:text-accent-dark font-bold underline">← נקה סינון</Link>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 mt-5">
            {recentClaims.map((claim, i) => (
              <div key={claim.id} className="card-in" style={{ animationDelay: `${i * 40}ms` }}>
                <ClaimCard claim={claim} />
              </div>
            ))}
          </div>
        )}
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
