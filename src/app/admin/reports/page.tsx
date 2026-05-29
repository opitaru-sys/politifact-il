import { prisma } from "@/lib/db";
import { dismissReport } from "../_actions";
import { AdminNav } from "@/components/AdminNav";
import { ApplyRecommendationButton } from "@/components/ApplyRecommendationButton";
import { RecheckClaimButton } from "@/components/RecheckClaimButton";
import { bootstrapLegacyKey, requireAdmin } from "@/lib/admin-auth";
import {
  actionLabel,
  recommendForReport,
  type ReportRecommendation,
} from "@/lib/report-recommendation";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ key?: string }>;
}

function formatTime(d: Date): string {
  return d.toLocaleString("he-IL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function confidenceBadge(c: number): { label: string; cls: string } {
  if (c >= 0.75) return { label: "ביטחון גבוה", cls: "bg-green-700" };
  if (c >= 0.5) return { label: "ביטחון בינוני", cls: "bg-amber-600" };
  if (c > 0) return { label: "ביטחון נמוך — בדוק ידנית", cls: "bg-red-700" };
  return { label: "AI כשל — בדוק ידנית", cls: "bg-stone-600" };
}

export default async function AdminReportsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  await bootstrapLegacyKey(sp, "/admin/reports");
  await requireAdmin();

  const reports = await prisma.report.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      claim: { include: { politician: true } },
    },
  });

  // Compute AI recommendations in parallel. Each ~1-2s; for 3-10 reports
  // the wait is acceptable on an admin-only page. If a single call fails,
  // the helper returns a "manual triage" placeholder rather than throwing.
  const recommendations = await Promise.all(
    reports.map((r) =>
      recommendForReport({
        reason: r.reason,
        details: r.details,
        claim: {
          quote: r.claim.quote,
          verdict: r.claim.verdict as "true" | "half-true" | "false",
          summary: r.claim.summary,
          explanation: r.claim.explanation,
          politicianName: r.claim.politician.name,
          politicianParty: r.claim.politician.party,
          topic: r.claim.topic,
          claimDate: r.claim.date,
        },
      }),
    ),
  );

  return (
    <div>
      <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-2">אדמין · דיווחים</div>
      <h1 className="text-3xl font-black mb-2 tracking-tight">דיווחי שגיאה ({reports.length})</h1>
      <p className="text-sm text-foreground-muted mb-6">
        דיווחים מהקהל על טענות לא מדויקות. בכל דיווח מופיעה המלצת AI עם כפתור החלה. השתמש ב<em>ערוך טענה</em> אם רוצה לבצע שינוי ידני.
      </p>

      <AdminNav active="reports" />

      {reports.length === 0 ? (
        <div className="bg-card border border-border p-8 mt-6 text-center text-foreground-muted" style={{ borderRadius: 4 }}>
          אין דיווחים פתוחים. כשמשתמש ילחץ &ldquo;דיווח על שגיאה&rdquo; על טענה, היא תופיע כאן.
        </div>
      ) : (
        <div className="space-y-3 mt-6">
          {reports.map((r, i) => {
            const rec = recommendations[i];
            return (
              <ReportCard
                key={r.id}
                report={r}
                recommendation={rec}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

type ReportRow = Awaited<
  ReturnType<typeof prisma.report.findMany<{ include: { claim: { include: { politician: true } } } }>>
>[number];

function ReportCard({
  report: r,
  recommendation: rec,
}: {
  report: ReportRow;
  recommendation: ReportRecommendation;
}) {
  const conf = confidenceBadge(rec.confidence);
  return (
    <div className="bg-card border border-border p-4" style={{ borderRadius: 4 }}>
      {/* Header */}
      <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider font-bold text-white bg-accent px-2 py-0.5" style={{ borderRadius: 2 }}>
            {r.reason}
          </span>
          <a
            href={`/politician/${r.claim.politicianId}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-bold hover:text-accent"
          >
            {r.claim.politician.name}
          </a>
          <span className="text-[11px] text-foreground-muted">· {r.claim.politician.party}</span>
        </div>
        <span className="text-[11px] text-foreground-muted tabular-nums">{formatTime(r.createdAt)}</span>
      </div>

      {/* Reported claim */}
      <blockquote className="text-sm text-foreground my-2 border-r-2 border-border pr-3">
        &ldquo;{r.claim.quote}&rdquo;
      </blockquote>
      <div className="text-[11px] text-foreground-muted mb-2">
        פסק נוכחי: <strong className="text-foreground">{r.claim.verdict}</strong>
        {" · "}
        {r.claim.editorApproved ? "אושר" : "לא אושר"}
      </div>

      {/* Reporter's details */}
      {r.details && (
        <div className="bg-background border border-border p-3 my-3 text-sm" style={{ borderRadius: 2 }}>
          <div className="text-[10px] uppercase tracking-wider font-bold text-foreground-muted mb-1">
            פירוט המדווח
          </div>
          {r.details}
        </div>
      )}

      {/* AI recommendation */}
      <div className="bg-background border-2 border-accent/40 p-3 my-3" style={{ borderRadius: 2 }}>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider font-bold text-accent">
            המלצת AI
          </span>
          <span className="text-[10px] text-foreground-muted normal-case tracking-normal">
            (ראשונית, ללא חיפוש מקורות)
          </span>
          <span className={`text-[10px] uppercase tracking-wider font-bold text-white px-2 py-0.5 ${conf.cls}`} style={{ borderRadius: 2 }}>
            {actionLabel(rec.action)}
          </span>
          <span className={`text-[10px] uppercase tracking-wider font-bold text-white px-2 py-0.5 ${conf.cls}`} style={{ borderRadius: 2 }}>
            {conf.label}
          </span>
        </div>
        <div className="text-[13px] text-foreground mb-2 leading-relaxed">
          <strong>נימוק: </strong>{rec.reasoning || "—"}
        </div>

        {rec.action === "change_verdict" && rec.newVerdict && (
          <div className="text-[12px] text-foreground-muted mb-2">
            <strong>פסק חדש: </strong>
            <span className="text-foreground font-bold">{rec.newVerdict}</span>
          </div>
        )}
        {rec.action === "edit_explanation" && rec.newExplanation && (
          <details className="text-[12px] text-foreground-muted mb-2">
            <summary className="cursor-pointer font-bold text-foreground">הסבר חדש מוצע (לחץ להצגה)</summary>
            <div className="mt-2 p-2 bg-card border border-border text-foreground leading-relaxed whitespace-pre-line" style={{ borderRadius: 2 }}>
              {rec.newExplanation}
            </div>
          </details>
        )}
        {(rec.action === "hide" || rec.action === "change_verdict" || rec.action === "edit_explanation") && (
          <div className="text-[12px] text-foreground-muted mb-2">
            <strong>הערת תיקון: </strong>
            <span className="text-foreground">{rec.correctionNote || "—"}</span>
          </div>
        )}

        {/* Apply button — POSTs to /api/admin/reports/apply via a client
            component, then router.refresh()s so the resolved report
            disappears from the list. */}
        {rec.confidence > 0 && (
          <ApplyRecommendationButton
            reportId={r.id}
            claimId={r.claimId}
            action={rec.action}
            newVerdict={rec.newVerdict}
            newExplanation={rec.newExplanation}
            correctionNote={rec.correctionNote}
          />
        )}
      </div>

      {/* Grounded re-check — the authoritative "actually verify" path. The
          recommendation above is a LITE pass with no web search; this runs a
          real grounded fact-check and corrects / confirms / withholds the
          claim, then resolves the report. Prefer this when the verdict is in
          doubt. */}
      <div className="bg-background border-2 border-green-700/40 p-3 my-3" style={{ borderRadius: 2 }}>
        <div className="text-[10px] uppercase tracking-wider font-bold text-green-700 mb-1">
          בדיקה חוזרת עם חיפוש (מומלץ)
        </div>
        <div className="text-[12px] text-foreground-muted mb-2 leading-relaxed">
          מריץ בדיקת עובדות אמיתית עם חיפוש מקורות. אם הטענה מתאמתת, הפסק יתוקן
          ויפורסם; אם לא, היא תועבר לבדיקה אנושית. הדיווח ייסגר בכל מקרה.
        </div>
        <RecheckClaimButton claimId={r.claimId} reportId={r.id} />
      </div>

      {/* Manual fallback actions */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border flex-wrap">
        <form action={dismissReport}>
          <input type="hidden" name="id" value={r.id} />
          <button
            type="submit"
            className="text-[11px] font-bold uppercase tracking-wider bg-accent text-white py-1.5 px-3 hover:opacity-90"
            style={{ borderRadius: 2 }}
            title="הדיווח טופל / אין מה לתקן — הסר מהרשימה"
          >
            סגור דיווח
          </button>
        </form>
        <a
          href={`/admin/claims?id=${r.claimId}`}
          className="text-[11px] font-bold uppercase tracking-wider border border-border hover:border-accent hover:text-accent py-1.5 px-3"
          style={{ borderRadius: 2 }}
          title="ערוך את הטענה עצמה (פסק, סטטוס, הסבר)"
        >
          ערוך טענה ←
        </a>
        <a
          href={`/claim/${r.claimId}`}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-foreground-muted hover:text-foreground"
          title="פתח את הטענה כפי שהציבור רואה"
        >
          צפייה ציבורית ↗
        </a>
        <span className="text-[10px] text-foreground-muted opacity-50 mr-auto">
          דיווח #{r.id.slice(-6)}
        </span>
      </div>
    </div>
  );
}
