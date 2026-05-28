import type { Metadata } from "next";
import { getPartyStats, getPartyParticipationMap } from "@/lib/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "השוואת מפלגות | בדוק",
  description: "איזו מפלגה הכי מדויקת? דירוג מפלגות ישראליות לפי אחוז טענות שנמצאו אמת",
};

function scoreColor(pct: number): string {
  if (pct < 40) return "var(--verdict-false)";
  if (pct < 60) return "var(--verdict-half)";
  return "var(--verdict-true)";
}

export default async function PartiesPage() {
  const [ascending, participationMap] = await Promise.all([
    getPartyStats(),
    getPartyParticipationMap(),
  ]);
  const stats = [...ascending].reverse();

  return (
    <div>
      <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-2">השוואה · 30 ימים אחרונים</div>
      <h1 className="text-4xl font-black mb-3 tracking-tight">דירוג מפלגות</h1>
      <p className="text-sm text-foreground-muted mb-8 max-w-2xl leading-relaxed">
        איזו מפלגה הכי מדויקת? דירוג לפי{" "}
        <span className="text-foreground font-bold">ציון דיוק עובדתי מתוקנן לגודל מדגם</span>{" "}
        ב-30 הימים האחרונים. מפלגה קטנה עם 5 טענות נכונות מקבלת ציון נמוך יותר ממפלגה גדולה עם 50 טענות נכונות.
        {" "}עמודת <span className="text-foreground font-bold">נוכחות</span> מציגה ממוצע השתתפות פעילה של ח״כי המפלגה בישיבות המליאה ב-90 הימים האחרונים.
      </p>

      <div className="space-y-3">
        {stats.map((stat, i) => {
          const falseWidth = (stat.falseClaims / stat.total) * 100;
          const halfWidth = (stat.halfTrue / stat.total) * 100;
          const trueWidth = (stat.trueClaims / stat.total) * 100;

          return (
            <div
              key={stat.party}
              className="bg-card border border-border-strong px-5 py-4"
              style={{ borderRadius: 4 }}
            >
              <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
                <div className="flex items-baseline gap-3">
                  <span className="text-sm font-black text-foreground-muted tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="font-black text-lg tracking-tight">{stat.party}</span>
                </div>
                <div className="flex items-baseline gap-5">
                  <div
                    className="flex items-baseline gap-2"
                    title={`ציון מתוקנן לגודל מדגם. אחוז האמת הגולמי: ${stat.truthPercentage}% מתוך ${stat.total} טענות.`}
                  >
                    <span
                      className="font-black text-2xl tabular-nums leading-none"
                      style={{ color: scoreColor(stat.credibilityScore) }}
                    >
                      {stat.credibilityScore}
                      <span className="text-base">%</span>
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-foreground-muted">
                      ציון דיוק עובדתי
                    </span>
                  </div>
                  {(() => {
                    const part = participationMap.get(stat.party);
                    if (!part) return null;
                    return (
                      <div
                        className="flex items-baseline gap-2"
                        title={`ממוצע ${part.mkCount} ח״כים מהמפלגה`}
                      >
                        <span className="font-black text-2xl tabular-nums leading-none text-foreground">
                          {Math.round(part.avgPct)}
                          <span className="text-base">%</span>
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-foreground-muted">
                          נוכחות
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div
                className="h-2.5 overflow-hidden flex bg-muted"
                style={{ borderRadius: 2 }}
              >
                <div
                  className="h-full"
                  style={{ width: `${falseWidth}%`, backgroundColor: "var(--verdict-false)" }}
                />
                <div
                  className="h-full"
                  style={{ width: `${halfWidth}%`, backgroundColor: "var(--verdict-half)" }}
                />
                <div
                  className="h-full"
                  style={{ width: `${trueWidth}%`, backgroundColor: "var(--verdict-true)" }}
                />
              </div>

              <div className="flex justify-between mt-3 text-[11px] text-foreground-muted uppercase tracking-wider tabular-nums">
                <span>
                  <span className="font-bold" style={{ color: "var(--verdict-false)" }}>
                    {stat.falseClaims}
                  </span>{" "}
                  שקר
                </span>
                <span>
                  <span className="font-bold" style={{ color: "var(--verdict-half)" }}>
                    {stat.halfTrue}
                  </span>{" "}
                  חצי אמת
                </span>
                <span>
                  <span className="font-bold" style={{ color: "var(--verdict-true)" }}>
                    {stat.trueClaims}
                  </span>{" "}
                  אמת
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
