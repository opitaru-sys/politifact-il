import { prisma } from "@/lib/db";

interface Props {
  politicianId: string;
  politicianName: string;
}

interface Committee {
  id: number;
  name: string;
}

/**
 * Displays the per-MK Knesset activity snapshot on /politician/[id]:
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ פעילות בכנסת · 90 ימים אחרונים                              │
 *   ├──────────────┬──────────────┬──────────────────────────────┤
 *   │   65%        │     4        │  ועדת חוקה, ועדת חוץ וביטחון, │
 *   │  השתתפות     │ הצעות חוק    │  שר האוצר                    │
 *   │  פעילה       │ שיזם         │                              │
 *   ├──────────────┴──────────────┴──────────────────────────────┤
 *   │ "השתתפות פעילה" — מספר ישיבות מליאה (מתוך 20) שבהן הח"כ דיבר │
 *   │ ב-90 הימים האחרונים. מקור: knesset.gov.il · עודכן 24/05      │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Reads `KnessetActivity` rows populated by `daily.mts` (via
 * `src/lib/knesset-activity.ts`). Returns null if no row exists —
 * politicians not in our NAME_TO_ID map or non-MKs don't get this
 * card, and the page renders without it gracefully.
 *
 * Server component — no client JS, fetches directly with Prisma.
 * Wrapped in a `<Suspense>` boundary by the consumer in case the
 * Neon cold-start blocks for a moment.
 */
export async function KnessetActivityCard({ politicianId, politicianName }: Props) {
  const row = await prisma.knessetActivity.findUnique({
    where: { politicianId },
  });
  if (!row) return null;

  const committees = (row.committeesMember as unknown as Committee[]) ?? [];
  // Sort committee names alphabetically (Hebrew sort) and dedupe by
  // name so multiple identical "חבר ועדה" entries don't render twice.
  const committeeNames = Array.from(new Set(committees.map((c) => c.name)))
    .sort((a, b) => a.localeCompare(b, "he"));

  // Color the participation % using the same verdict-color scale
  // as the credibility score for visual consistency:
  //   <40 = red ("absent more than present"), 40-69 = amber,
  //   ≥70 = green. Threshold reasoning matches the leaderboard
  //   threshold (20%) — anything red on the card is below-threshold
  //   for ranking eligibility too.
  const pct = row.plenumParticipationPct;
  const pctColor =
    pct < 40
      ? "var(--verdict-false)"
      : pct < 70
      ? "var(--verdict-half)"
      : "var(--verdict-true)";

  // Window label — show "90 ימים אחרונים" by default but allow the
  // window to drift if the row was written with a different span.
  const windowDays = Math.round(
    (row.windowEnd.getTime() - row.windowStart.getTime()) / (1000 * 60 * 60 * 24),
  );

  const fetchedDate = row.fetchedAt.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "long",
  });

  return (
    <section
      className="bg-card border border-border-strong p-7 mb-8"
      style={{ borderRadius: 4 }}
    >
      <div className="flex items-baseline justify-between mb-4 pb-3 border-b border-border">
        <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold">
          פעילות בכנסת
        </div>
        <span className="text-[11px] text-foreground-muted">
          {windowDays} ימים אחרונים
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-0 border border-border" style={{ borderRadius: 2 }}>
        <div className="px-3 py-4 text-center border-l border-border">
          <div
            className="text-3xl font-black tabular-nums leading-none"
            style={{ color: pctColor }}
          >
            {Math.round(pct)}
            <span className="text-lg">%</span>
          </div>
          <div className="text-[10px] uppercase tracking-wider text-foreground-muted mt-1.5">
            השתתפות פעילה
          </div>
          <div className="text-[10px] text-foreground-muted mt-0.5 tabular-nums">
            {row.plenumSessionsSpoken} מתוך {row.plenumSessionsTotal} ישיבות
          </div>
        </div>

        <div className="px-3 py-4 text-center border-l border-border">
          <div className="text-3xl font-black tabular-nums leading-none text-foreground">
            {row.billsSponsored}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-foreground-muted mt-1.5">
            הצעות חוק
          </div>
          <div className="text-[10px] text-foreground-muted mt-0.5">
            שיזם או חבר ביזום
          </div>
        </div>

        <div className="px-3 py-4 text-center col-span-2 sm:col-span-1">
          <div className="text-3xl font-black tabular-nums leading-none text-foreground">
            {committeeNames.length}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-foreground-muted mt-1.5">
            תפקידים פעילים
          </div>
          <div className="text-[10px] text-foreground-muted mt-0.5">
            ועדות ותפקידים
          </div>
        </div>
      </div>

      {committeeNames.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="text-[10px] uppercase tracking-wider text-foreground-muted mb-2">
            תפקידים נוכחיים
          </div>
          <div className="flex flex-wrap gap-1.5">
            {committeeNames.slice(0, 12).map((name) => (
              <span
                key={name}
                className="inline-block px-2.5 py-1 text-[11px] bg-background-alt border border-border"
                style={{ borderRadius: 2 }}
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-foreground-muted leading-relaxed mt-4">
        <strong>השתתפות פעילה</strong>: מספר ישיבות מליאה ({row.plenumSessionsTotal} בסך הכל ב-{windowDays} ימים) שבהן {politicianName} דיבר.{" "}
        מקור: <a href="https://knesset.gov.il/" target="_blank" rel="noopener noreferrer" className="underline hover:text-accent">knesset.gov.il</a> · עודכן {fetchedDate}.
      </p>
    </section>
  );
}
