import type { Metadata } from "next";
import Link from "next/link";
import { getPoliticianStats, getUnrankedPoliticians, STATS_WINDOW_DAYS } from "@/lib/data";
import { PoliticianAvatar } from "@/components/PoliticianAvatar";

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

// Day windows the user can switch between. `all` means no time filter —
// useful now that we have a large backfilled dataset of older Knesset
// transcripts that would otherwise be invisible on the leaderboard.
const WINDOW_OPTIONS: { value: string; label: string; days: number | undefined }[] = [
  { value: "7", label: "שבוע", days: 7 },
  { value: "30", label: "חודש", days: 30 },
  { value: "90", label: "3 חודשים", days: 90 },
  { value: "365", label: "שנה", days: 365 },
  { value: "all", label: "הכל", days: undefined },
];

interface PageProps {
  searchParams: Promise<{ window?: string }>;
}

export default async function LeaderboardPage({ searchParams }: PageProps) {
  const { window: windowParam } = await searchParams;
  const selected =
    WINDOW_OPTIONS.find((w) => w.value === windowParam) ??
    WINDOW_OPTIONS.find((w) => w.days === STATS_WINDOW_DAYS) ??
    WINDOW_OPTIONS[1];

  const [ascending, unranked] = await Promise.all([
    getPoliticianStats(selected.days),
    getUnrankedPoliticians(selected.days),
  ]);
  const stats = [...ascending].reverse();

  const windowLabel = selected.days
    ? `${selected.days} ימים אחרונים`
    : "מכל הזמנים";

  return (
    <div>
      <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-2">
        דירוג · {windowLabel}
      </div>
      <h1 className="text-4xl font-black mb-3 tracking-tight">טבלת האמינות</h1>
      <p className="text-sm text-foreground-muted mb-6 max-w-2xl leading-relaxed">
        דירוג של {stats.length} פוליטיקאים לפי אחוז הטענות שנמצאו אמת מתוך הטענות שנבדקו{" "}
        <span className="text-foreground font-bold">{windowLabel === "מכל הזמנים" ? "בכל הזמנים" : `ב-${windowLabel}`}</span>.
        אמינות מחושבת כ-<span className="text-foreground font-bold">(טענות אמת + ½ × חצי אמת) ÷ סה״כ טענות</span>.
      </p>

      {/* Window selector — mirrors the home feed's date filter. The query
          param `?window=` is read on the server, so the page is fully
          static and no client JS is needed. */}
      <div className="mb-6 flex items-center gap-1 flex-wrap text-[12px]">
        <span className="px-2 py-1 text-[10px] uppercase tracking-wider text-foreground-muted border border-border" style={{ borderRadius: 2 }}>
          תקופה
        </span>
        {WINDOW_OPTIONS.map((w) => (
          <Link
            key={w.value}
            href={w.value === "30" ? "/leaderboard" : `/leaderboard?window=${w.value}`}
            className={`px-2.5 py-1 font-medium transition-colors border ${
              w.value === selected.value
                ? "bg-foreground text-background border-foreground"
                : "border-border text-foreground-muted hover:text-foreground hover:border-foreground-muted"
            }`}
            style={{ borderRadius: 2 }}
          >
            {w.label}
          </Link>
        ))}
      </div>

      <div
        className="bg-card border border-border-strong overflow-hidden"
        style={{ borderRadius: 4 }}
      >
        <div className="grid grid-cols-[2rem_1fr_auto] sm:grid-cols-[2rem_1fr_auto_auto] gap-x-4 px-5 py-2.5 border-b-[1.5px] border-border-strong text-[10px] font-bold text-foreground-muted uppercase tracking-[0.18em]">
          <span>#</span>
          <span>פוליטיקאי</span>
          <span>אמינות</span>
          <span className="hidden sm:inline">טענות</span>
        </div>
        <ol>
          {stats.map((stat, i) => (
            <li key={stat.politician.id} className="border-b border-border last:border-b-0">
              <a
                href={`/politician/${stat.politician.id}`}
                className="grid grid-cols-[2rem_1fr_auto] sm:grid-cols-[2rem_1fr_auto_auto] gap-x-4 items-center px-5 py-3 hover:bg-muted/40 transition-colors"
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
          ))}
        </ol>
      </div>

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
