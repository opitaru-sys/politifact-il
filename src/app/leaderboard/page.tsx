import type { Metadata } from "next";
import {
  getPoliticianStats,
  getUnrankedPoliticians,
  getKnessetActivityMap,
  MIN_PARTICIPATION_FOR_RANKING,
} from "@/lib/data";
import { getDataCollectionStart } from "@/lib/queries";
import { PoliticianAvatar } from "@/components/PoliticianAvatar";
import { WindowSelector } from "@/components/WindowSelector";
import { TruthAttendanceScatter } from "@/components/TruthAttendanceScatter";
import { resolveWindow, windowLabel as windowLabelFn } from "@/lib/window";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "טבלת האמינות | בדוק",
  description: "דירוג פוליטיקאים ישראליים לפי אחוז הטענות שנמצאו אמת",
};

function scoreColor(pct: number): string {
  if (pct < 40) return "var(--verdict-false)";
  if (pct < 60) return "var(--verdict-half)";
  return "var(--verdict-true)";
}

interface PageProps {
  searchParams: Promise<{ window?: string }>;
}

export default async function LeaderboardPage({ searchParams }: PageProps) {
  const { window: windowParam } = await searchParams;
  const selected = resolveWindow(windowParam);

  const [ascending, unranked, collectionStart, activityMap] = await Promise.all([
    getPoliticianStats(selected.days),
    getUnrankedPoliticians(selected.days),
    getDataCollectionStart(),
    getKnessetActivityMap(),
  ]);

  // Split ranking by Knesset participation threshold. MKs with too
  // low plenum participation in the last 90 days don't qualify for
  // the credibility ranking — same logic as MIN_CLAIMS_FOR_RANKING.
  // Politicians outside the activity map (not current MKs / not
  // matched) are kept in the main ranking by default; the threshold
  // only filters down those we actually have activity data for.
  const stats = [...ascending].sort((a, b) => {
    if (a.truthPercentage !== b.truthPercentage) {
      return b.truthPercentage - a.truthPercentage;
    }
    return b.totalClaims - a.totalClaims;
  });
  const qualifying: typeof stats = [];
  const belowThreshold: typeof stats = [];
  for (const s of stats) {
    const activity = activityMap.get(s.politician.id);
    if (activity && activity.plenumParticipationPct < MIN_PARTICIPATION_FOR_RANKING) {
      belowThreshold.push(s);
    } else {
      qualifying.push(s);
    }
  }

  // Build scatter points — include every politician we have BOTH a
  // credibility number AND a Knesset activity row for. Below-threshold
  // MKs are intentionally shown in the chart (the "low-attendance"
  // quadrant is part of the story), but politicians we can't pair
  // (no activity data, e.g. former MKs still appearing in claims) are
  // skipped. Limit to politicians with at least one fact-check claim
  // in the window so the chart isn't dominated by zero-percent dots.
  const scatterPoints = [...stats]
    .filter((s) => s.totalClaims > 0 && activityMap.has(s.politician.id))
    .map((s) => {
      const a = activityMap.get(s.politician.id)!;
      return {
        politicianId: s.politician.id,
        name: s.politician.name,
        party: s.politician.party,
        truthPct: s.truthPercentage,
        attendancePct: a.plenumParticipationPct,
        totalClaims: s.totalClaims,
      };
    });

  const windowLabel = windowLabelFn(selected.value);

  return (
    <div>
      <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-2">
        דירוג · {windowLabel}
      </div>
      <h1 className="text-4xl font-black mb-3 tracking-tight">טבלת האמינות</h1>
      <p className="text-sm text-foreground-muted mb-6 max-w-2xl leading-relaxed">
        דירוג של {qualifying.length} פוליטיקאים לפי אחוז הטענות שנמצאו אמת מתוך הטענות שנבדקו{" "}
        <span className="text-foreground font-bold">{windowLabel === "מכל הזמנים" ? "בכל הזמנים" : `ב-${windowLabel}`}</span>.
        אמינות מחושבת כ-<span className="text-foreground font-bold">(טענות אמת + ½ × חצי אמת) ÷ סה״כ טענות</span>.
        ח״כים שדיברו בפחות מ-{MIN_PARTICIPATION_FOR_RANKING}% מישיבות המליאה ב-90 הימים האחרונים מופיעים בנפרד למטה.
      </p>

      {/* Window selector — shared component, same options on the home
          page and politician profile so visitors compare apples-to-
          apples. */}
      <div className="mb-6">
        <WindowSelector basePath="/leaderboard" selectedValue={selected.value} />
      </div>

      {/* Data-since anchor */}
      {collectionStart && (
        <p className="text-[11px] text-foreground-muted mb-6 -mt-2">
          איסוף הנתונים מתחיל ב-
          <strong className="text-foreground tabular-nums">
            {collectionStart.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}
          </strong>
          . הטבלה הנוכחית מציגה {windowLabel}.
        </p>
      )}

      {/* Truth × attendance scatter — alternative view of the same
          data, no formula. Skipped if too few points to be meaningful. */}
      {scatterPoints.length >= 5 && (
        <div className="mb-8">
          <TruthAttendanceScatter points={scatterPoints} />
        </div>
      )}

      <div
        className="bg-card border border-border-strong overflow-hidden"
        style={{ borderRadius: 4 }}
      >
        <div className="grid grid-cols-[2rem_1fr_auto] sm:grid-cols-[2rem_1fr_auto_auto_auto] gap-x-4 px-5 py-2.5 border-b-[1.5px] border-border-strong text-[10px] font-bold text-foreground-muted uppercase tracking-[0.18em]">
          <span>#</span>
          <span>פוליטיקאי</span>
          <span>אמינות</span>
          <span className="hidden sm:inline">השתתפות</span>
          <span className="hidden sm:inline">טענות</span>
        </div>
        <ol>
          {qualifying.map((stat, i) => {
            const activity = activityMap.get(stat.politician.id);
            return (
              <li key={stat.politician.id} className="border-b border-border last:border-b-0">
                <a
                  href={`/politician/${stat.politician.id}`}
                  className="grid grid-cols-[2rem_1fr_auto] sm:grid-cols-[2rem_1fr_auto_auto_auto] gap-x-4 items-center px-5 py-3 hover:bg-muted/40 transition-colors"
                >
                  <span className="text-base font-black text-foreground-muted tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="flex items-center gap-3 min-w-0">
                    <PoliticianAvatar
                      id={stat.politician.id}
                      name={stat.politician.name}
                      image={stat.politician.image}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <div className="font-bold text-sm truncate">{stat.politician.name}</div>
                      <div className="text-[11px] text-foreground-muted truncate">
                        {stat.politician.party}
                        <span className="sm:hidden"> · {stat.totalClaims} טענות</span>
                      </div>
                    </div>
                  </div>
                  <div
                    className="font-black text-xl tabular-nums leading-none"
                    style={{ color: scoreColor(stat.truthPercentage) }}
                  >
                    {stat.truthPercentage}
                    <span className="text-sm">%</span>
                  </div>
                  <div
                    className="hidden sm:block text-sm font-bold tabular-nums text-foreground-muted text-center min-w-[3.5rem]"
                    title={
                      activity
                        ? `${activity.plenumSessionsSpoken} מתוך ${activity.plenumSessionsTotal} ישיבות מליאה ב-90 הימים האחרונים`
                        : "אין נתוני השתתפות"
                    }
                  >
                    {activity ? `${Math.round(activity.plenumParticipationPct)}%` : "—"}
                  </div>
                  <div className="hidden sm:flex gap-1 text-[11px] font-bold tabular-nums">
                    <span
                      className="px-1.5 py-0.5"
                      style={{
                        backgroundColor: "var(--verdict-false-bg)",
                        color: "var(--verdict-false)",
                        borderRadius: 2,
                      }}
                    >
                      {stat.falseClaims}
                    </span>
                    <span
                      className="px-1.5 py-0.5"
                      style={{
                        backgroundColor: "var(--verdict-half-bg)",
                        color: "var(--verdict-half)",
                        borderRadius: 2,
                      }}
                    >
                      {stat.halfTrueClaims}
                    </span>
                    <span
                      className="px-1.5 py-0.5"
                      style={{
                        backgroundColor: "var(--verdict-true-bg)",
                        color: "var(--verdict-true)",
                        borderRadius: 2,
                      }}
                    >
                      {stat.trueClaims}
                    </span>
                  </div>
                </a>
              </li>
            );
          })}
        </ol>
      </div>

      {belowThreshold.length > 0 && (
        <section className="mt-10">
          <div className="flex items-baseline justify-between mb-3 pb-2 border-b border-border">
            <h2 className="font-black text-base tracking-tight">
              ח״כים מחוץ לדירוג
            </h2>
            <span className="text-[11px] uppercase tracking-wider text-foreground-muted">
              {belowThreshold.length} · השתתפות נמוכה
            </span>
          </div>
          <p className="text-[12px] text-foreground-muted leading-relaxed mb-3 max-w-2xl">
            השתתפו בפחות מ-{MIN_PARTICIPATION_FOR_RANKING}% מישיבות המליאה ב-90 הימים האחרונים.
            הטענות עדיין נבדקות אבל הם לא נכנסים לדירוג הראשי כי המדגם דליל מדי לקבל הקשר.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {belowThreshold.map((stat) => {
              const activity = activityMap.get(stat.politician.id);
              return (
                <a
                  key={stat.politician.id}
                  href={`/politician/${stat.politician.id}`}
                  className="flex items-center gap-3 px-3 py-2 bg-card border border-border hover:bg-muted/40 transition-colors"
                  style={{ borderRadius: 4 }}
                >
                  <PoliticianAvatar
                    id={stat.politician.id}
                    name={stat.politician.name}
                    image={stat.politician.image}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm truncate">{stat.politician.name}</div>
                    <div className="text-[10px] text-foreground-muted truncate">
                      {stat.politician.party} · {stat.totalClaims} טענות
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className="text-sm font-black tabular-nums leading-none"
                      style={{ color: scoreColor(stat.truthPercentage) }}
                    >
                      {stat.truthPercentage}%
                    </div>
                    <div className="text-[10px] text-foreground-muted mt-0.5 tabular-nums">
                      השתתפות {activity ? Math.round(activity.plenumParticipationPct) : 0}%
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {unranked.length > 0 && (
        <section className="mt-12">
          <div className="flex items-baseline justify-between mb-4 pb-3 border-b-[1.5px] border-border-strong">
            <h2 className="font-black text-lg tracking-tight">פוליטיקאים שטרם נדרגו</h2>
            <span className="text-[11px] tracking-wider uppercase text-foreground-muted">
              {unranked.length} ב-DB · אין טענות שנבדקו ב{windowLabel}
            </span>
          </div>
          <p className="text-[12px] text-foreground-muted leading-relaxed mb-5 max-w-2xl">
            פוליטיקאים שמופיעים במאגר אך לא נמצאה להם טענה ב{windowLabel}. הם יופיעו בטבלה ברגע שתופיע ציטוט שלהם בכתבה או בכנסת.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {unranked.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 px-3 py-2 bg-card border border-border"
                style={{ borderRadius: 4 }}
                title={`${p.name} · ${p.party}`}
              >
                <PoliticianAvatar id={p.id} name={p.name} image={p.image} size="sm" />
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{p.name}</div>
                  <div className="text-[10px] text-foreground-muted truncate uppercase tracking-wider">
                    {p.party}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
