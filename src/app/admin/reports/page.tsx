import { prisma } from "@/lib/db";
import { dismissReport } from "../_actions";

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

export default async function AdminReportsPage({ searchParams }: PageProps) {
  const { key } = await searchParams;
  if (!key || key !== process.env.ADMIN_SECRET) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-black mb-2">🔒 דף אדמין</h1>
        <p className="text-sm text-foreground-muted mb-4">
          הוסף את <code className="bg-muted px-2 py-1 rounded">?key=YOUR_SECRET</code> ל-URL
        </p>
      </div>
    );
  }

  const reports = await prisma.report.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      claim: { include: { politician: true } },
    },
  });

  return (
    <div>
      <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-2">אדמין · דיווחים</div>
      <h1 className="text-3xl font-black mb-2 tracking-tight">דיווחי שגיאה ({reports.length})</h1>
      <p className="text-sm text-foreground-muted mb-6">
        דיווחים מהקהל על טענות לא מדויקות. השתמש ב<em>סגור</em> אם בדקת ואין מה לתקן, או ב<em>ערוך טענה</em> כדי לעדכן את הטענה עצמה.
      </p>

      <AdminNav active="reports" adminKey={key} />

      {reports.length === 0 ? (
        <div className="bg-card border border-border p-8 mt-6 text-center text-foreground-muted" style={{ borderRadius: 4 }}>
          אין דיווחים פתוחים. כשמשתמש ילחץ &ldquo;דיווח על שגיאה&rdquo; על טענה, היא תופיע כאן.
        </div>
      ) : (
        <div className="space-y-3 mt-6">
          {reports.map((r) => (
            <div key={r.id} className="bg-card border border-border p-4" style={{ borderRadius: 4 }}>
              {/* Header: reason + politician + when */}
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
                <span className="text-[11px] text-foreground-muted tabular-nums">
                  {formatTime(r.createdAt)}
                </span>
              </div>

              {/* The claim being reported */}
              <blockquote className="text-sm text-foreground my-2 border-r-2 border-border pr-3">
                &ldquo;{r.claim.quote}&rdquo;
              </blockquote>
              <div className="text-[11px] text-foreground-muted mb-2">
                פסק נוכחי: <strong className="text-foreground">{r.claim.verdict}</strong>
                {" · "}
                {r.claim.editorApproved ? "אושר" : "לא אושר"}
              </div>

              {/* Reporter's details (if any) */}
              {r.details && (
                <div className="bg-background border border-border p-3 my-3 text-sm" style={{ borderRadius: 2 }}>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-foreground-muted mb-1">
                    פירוט המדווח
                  </div>
                  {r.details}
                </div>
              )}

              {/* Actions: dismiss (delete report) | edit the underlying claim | open the public page */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border flex-wrap">
                <form action={dismissReport}>
                  <input type="hidden" name="key" value={key} />
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
                  href={`/admin/claims?key=${key}&id=${r.claimId}`}
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
          ))}
        </div>
      )}
    </div>
  );
}

function AdminNav({ active, adminKey }: { active: "status" | "claims" | "reports"; adminKey: string }) {
  const items: { id: typeof active; label: string; href: string }[] = [
    { id: "status", label: "סטטוס", href: `/admin/status?key=${adminKey}` },
    { id: "claims", label: "עריכת טענות", href: `/admin/claims?key=${adminKey}` },
    { id: "reports", label: "דיווחים", href: `/admin/reports?key=${adminKey}` },
  ];
  return (
    <nav className="flex items-center gap-1 text-[11px] tracking-wider uppercase">
      {items.map((it) => (
        <a
          key={it.id}
          href={it.href}
          className={
            it.id === active
              ? "text-foreground font-bold border-b-2 border-accent pb-1 ml-3"
              : "text-foreground-muted hover:text-foreground font-medium border-b-2 border-transparent pb-1 ml-3"
          }
        >
          {it.label} {it.id !== active && "→"}
        </a>
      ))}
    </nav>
  );
}
