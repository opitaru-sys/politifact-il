import type { Metadata } from "next";
import { getPoliticianStats, getUnrankedPoliticians } from "@/lib/data";
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

export default async function LeaderboardPage() {
  const [ascending, unranked] = await Promise.all([
    getPoliticianStats(),
    getUnrankedPoliticians(),
  ]);
  const stats = [...ascending].reverse();

  return (
    <div>
      <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-2">דירוג · 30 ימים אחרונים</div>
      <h1 className="text-4xl font-black mb-3 tracking-tight">טבלת האמינות</h1>
      <p className="text-sm text-foreground-muted mb-8 max-w-2xl leading-relaxed">
        דירוג של {stats.length} פוליטיקאים לפי אחוז הטענות שנמצאו אמת מתוך הטענות שנבדקו{" "}
        <span className="text-foreground font-bold">ב-30 הימים האחרונים</span>.
        אמינות מחושבת כ-<span className="text-foreground font-bold">(טענות אמת + ½ × חצי אמת) ÷ סה״כ טענות</span>.
      </p>

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
              {unranked.length} ב-DB · אין טענות שנבדקו בחודש האחרון
            </span>
          </div>
          <p className="text-[12px] text-foreground-muted leading-relaxed mb-5 max-w-2xl">
            פוליטיקאים שמופיעים במאגר אך לא נמצאה להם טענה ב-30 הימים האחרונים. הם יופיעו בטבלה ברגע שתופיע ציטוט שלהם בכתבה או בכנסת.
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
