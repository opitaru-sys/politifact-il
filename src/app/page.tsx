import Link from "next/link";
import { getRecentClaims, getPoliticianStats, getAllPoliticiansLite } from "@/lib/data";
import { LiarOfTheWeek } from "@/components/LiarOfTheWeek";
import { ClaimCard } from "@/components/ClaimCard";
import { LeaderboardPreview } from "@/components/LeaderboardPreview";
import { SearchBar } from "@/components/SearchBar";
import { FeedFilters } from "@/components/FeedFilters";
import { topicDisplayLabel } from "@/lib/topics";

export const dynamic = "force-dynamic";

const DAY_OPTIONS = [7, 30, 90, 365];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; days?: string; politician?: string }>;
}) {
  const sp = await searchParams;
  const activeTopic = sp.topic?.trim() || null;
  const activePolitician = sp.politician?.trim() || null;
  const daysRaw = parseInt(sp.days ?? "30", 10);
  const activeDays = DAY_OPTIONS.includes(daysRaw) ? daysRaw : 30;

  const [allRecent, stats, allPoliticians] = await Promise.all([
    getRecentClaims(activeDays),
    getPoliticianStats(),
    getAllPoliticiansLite(),
  ]);

  let recentClaims = allRecent;
  if (activeTopic) recentClaims = recentClaims.filter((c) => c.topic === activeTopic);
  if (activePolitician) recentClaims = recentClaims.filter((c) => c.politicianId === activePolitician);

  const politicianFilterLabel = activePolitician
    ? allPoliticians.find((p) => p.id === activePolitician)?.name ?? activePolitician
    : null;

  const hasFilter = activeTopic || activePolitician || activeDays !== 30;

  return (
    <div className="space-y-10">
      {/* Editorial masthead intro */}
      <section className="pt-1 pb-2">
        <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-3">
          עודכן · {new Date().toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}
        </div>
        <h1 className="text-4xl md:text-5xl font-black leading-[1.05] tracking-tight max-w-3xl">
          מי הכי <span style={{ color: "var(--verdict-true)" }}>אמין</span> בפוליטיקה
          <span className="text-accent">.</span>
        </h1>
        <p className="text-sm md:text-base text-foreground-muted max-w-2xl mt-3 leading-relaxed">
          בדיקת עובדות לכל טענה ציבורית של פוליטיקאי ישראלי. ציטוט מקורי, פסק דין מנומק, וקישור לכתבה המקורית.
        </p>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <LiarOfTheWeek stats={stats} />
        <LeaderboardPreview stats={stats} />
      </div>

      <SearchBar politicians={allPoliticians} />

      <section>
        <div className="flex items-baseline justify-between mb-3 pb-3 border-b-[1.5px] border-border-strong gap-3 flex-wrap">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h2 className="font-black text-xl tracking-tight">
              {activeTopic ? "טענות בנושא" : activePolitician ? "טענות של" : "טענות אחרונות"}
            </h2>
            {activeTopic && (
              <a
                href={buildHref({ topic: null, politician: activePolitician, days: activeDays })}
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
                href={buildHref({ topic: activeTopic, politician: null, days: activeDays })}
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
            {recentClaims.length} טענות · {activeDays} ימים אחרונים
          </span>
        </div>

        <FeedFilters
          activeDays={activeDays}
          activePolitician={activePolitician}
          activeTopic={activeTopic}
          politicians={allPoliticians}
          dayOptions={DAY_OPTIONS}
        />

        {recentClaims.length === 0 ? (
          <div className="bg-card border border-border p-8 mt-5 text-center text-foreground-muted text-sm" style={{ borderRadius: 4 }}>
            לא נמצאו טענות התואמות את הסינון ב-{activeDays} הימים האחרונים.
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

function buildHref(params: { topic: string | null; politician: string | null; days: number }): string {
  const sp = new URLSearchParams();
  if (params.topic) sp.set("topic", params.topic);
  if (params.politician) sp.set("politician", params.politician);
  if (params.days !== 30) sp.set("days", String(params.days));
  const qs = sp.toString();
  return qs ? `/?${qs}` : "/";
}
