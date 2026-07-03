import type { Metadata } from "next";
import { getPartyStats, getPartyParticipationMap } from "@/lib/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "השוואת מפלגות | בדוק",
  description: "איזו מפלגה מטעה הכי הרבה? דירוג מפלגות ישראליות לפי ניקוד הטעיה",
  alternates: { canonical: "/parties" },
};

export default async function PartiesPage() {
  const [partyStats, participationMap] = await Promise.all([
    getPartyStats(),
    getPartyParticipationMap(),
  ]);
  // Most misleading party at top — weighted lie score (false×1 + half×0.5).
  const stats = [...partyStats].sort(
    (a, b) => b.lieScore - a.lieScore || b.falseClaims - a.falseClaims,
  );

  return (
    <div>
      <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-2">השוואה · 30 ימים אחרונים</div>
      <h1 className="text-4xl font-black mb-3 tracking-tight">איזו מפלגה מטעה הכי הרבה</h1>
      <p className="text-sm text-foreground-muted mb-8 max-w-2xl leading-relaxed">
        דירוג מפלגות לפי{" "}
        <span className="text-foreground font-bold">ניקוד הטעיה</span>{" "}
        ב-30 הימים האחרונים: כל טענת שקר שווה נקודה, כל חצי-אמת חצי נקודה.
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
                    title={`ניקוד הטעיה: ${stat.lieScore} (שקר=1, חצי=0.5). ${stat.truthPercentage}% אמת מתוך ${stat.total} טענות.`}
                  >
                    <span
                      className="font-black text-2xl tabular-nums leading-none"
                      style={{ color: "var(--verdict-false)" }}
                    >
                      {stat.lieScore}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-foreground-muted">
                      ניקוד הטעיה
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
