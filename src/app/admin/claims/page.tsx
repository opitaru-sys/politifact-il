import { prisma } from "@/lib/db";
import { updateClaim, deleteClaim } from "../_actions";
import { AdminNav } from "@/components/AdminNav";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    key?: string;
    status?: string;
    verdict?: string;
    approved?: string;
    politician?: string;
    page?: string;
    /** When set, show only this single claim (used by /admin/reports → edit link). */
    id?: string;
  }>;
}

const PAGE_SIZE = 25;

export default async function AdminClaimsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const { key } = params;
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

  // Filters
  const where: {
    id?: string;
    status?: string;
    verdict?: string;
    editorApproved?: boolean;
    politicianId?: string;
  } = {};
  // Single-claim mode: when id is set, ignore every other filter. Used
  // by the "edit claim" link from the reports page.
  if (params.id) {
    where.id = params.id;
  } else {
    if (params.status && params.status !== "all") where.status = params.status;
    if (params.verdict && params.verdict !== "all") where.verdict = params.verdict;
    if (params.approved === "yes") where.editorApproved = true;
    else if (params.approved === "no") where.editorApproved = false;
    if (params.politician && params.politician !== "all") where.politicianId = params.politician;
  }

  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const skip = (page - 1) * PAGE_SIZE;

  const [total, claims, politicians] = await Promise.all([
    prisma.claim.count({ where }),
    prisma.claim.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
      include: { politician: { select: { id: true, name: true } } },
    }),
    prisma.politician.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Helper to build URLs preserving other filters.
  function urlWith(overrides: Record<string, string | number | undefined>): string {
    const p = new URLSearchParams();
    p.set("key", key!);
    if (params.status && params.status !== "all") p.set("status", params.status);
    if (params.verdict && params.verdict !== "all") p.set("verdict", params.verdict);
    if (params.approved) p.set("approved", params.approved);
    if (params.politician) p.set("politician", params.politician);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === "" || v === "all") p.delete(k);
      else p.set(k, String(v));
    }
    return `/admin/claims?${p.toString()}`;
  }

  return (
    <div>
      <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-2">אדמין · עריכת טענות</div>
      <h1 className="text-3xl font-black mb-2 tracking-tight">עריכת טענות</h1>
      <p className="text-sm text-foreground-muted mb-6">
        עריכה ידנית של פסק דין, סטטוס, ואישור עורך. שינויים נכנסים מיד לאחר שמירה.
      </p>

      <AdminNav active="claims" adminKey={key} />

      {/* Filters */}
      <form className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6 mb-6 bg-card border border-border p-3" style={{ borderRadius: 4 }}>
        <input type="hidden" name="key" value={key} />
        <FilterSelect
          name="status"
          label="סטטוס"
          value={params.status ?? "all"}
          options={[
            { v: "all", l: "הכל" },
            { v: "published", l: "פורסם" },
            { v: "draft", l: "טיוטה" },
            { v: "review", l: "בבדיקה" },
            { v: "rejected", l: "נדחה" },
          ]}
        />
        <FilterSelect
          name="verdict"
          label="פסק דין"
          value={params.verdict ?? "all"}
          options={[
            { v: "all", l: "הכל" },
            { v: "true", l: "אמת" },
            { v: "half-true", l: "חצי אמת" },
            { v: "false", l: "שקר" },
          ]}
        />
        <FilterSelect
          name="approved"
          label="אישור עורך"
          value={params.approved ?? ""}
          options={[
            { v: "", l: "הכל" },
            { v: "yes", l: "אושר" },
            { v: "no", l: "נדחה" },
          ]}
        />
        <FilterSelect
          name="politician"
          label="פוליטיקאי"
          value={params.politician ?? "all"}
          options={[
            { v: "all", l: "הכל" },
            ...politicians.map((p) => ({ v: p.id, l: p.name })),
          ]}
        />
        <button
          type="submit"
          className="self-end bg-accent text-white font-bold text-sm py-2 px-3"
          style={{ borderRadius: 4 }}
        >
          סנן
        </button>
      </form>

      <p className="text-xs text-foreground-muted mb-3 tabular-nums">
        {total} טענות · עמוד {page} מתוך {totalPages}
      </p>

      {/* Claims list */}
      <div className="space-y-3">
        {claims.map((c) => (
          <ClaimRow
            key={c.id}
            claim={{
              id: c.id,
              quote: c.quote,
              verdict: c.verdict,
              status: c.status,
              editorApproved: c.editorApproved,
              summary: c.summary,
              explanation: c.explanation,
              confidence: c.confidence,
              verifierNotes: c.verifierNotes,
              correctionNote: c.correctionNote,
              correctedAt: c.correctedAt,
              createdAt: c.createdAt,
              politician: c.politician,
            }}
            adminKey={key}
            defaultOpen={params.id === c.id}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 text-sm">
          <a
            href={urlWith({ page: Math.max(1, page - 1) })}
            className={`px-3 py-2 border border-border ${page <= 1 ? "opacity-30 pointer-events-none" : "hover:bg-muted/40"}`}
            style={{ borderRadius: 4 }}
          >
            ← קודם
          </a>
          <span className="text-foreground-muted tabular-nums">
            {page} / {totalPages}
          </span>
          <a
            href={urlWith({ page: Math.min(totalPages, page + 1) })}
            className={`px-3 py-2 border border-border ${page >= totalPages ? "opacity-30 pointer-events-none" : "hover:bg-muted/40"}`}
            style={{ borderRadius: 4 }}
          >
            הבא →
          </a>
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: { v: string; l: string }[];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-foreground-muted font-bold">{label}</span>
      <select
        name={name}
        defaultValue={value}
        className="bg-background border border-border text-sm py-1.5 px-2"
        style={{ borderRadius: 4 }}
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>{o.l}</option>
        ))}
      </select>
    </label>
  );
}

interface ClaimRowData {
  id: string;
  quote: string;
  verdict: string;
  status: string;
  editorApproved: boolean;
  summary: string | null;
  explanation: string;
  confidence: number | null;
  verifierNotes: string | null;
  correctionNote: string | null;
  correctedAt: Date | null;
  createdAt: Date;
  politician: { id: string; name: string };
}

function ClaimRow({ claim, adminKey, defaultOpen = false }: { claim: ClaimRowData; adminKey: string; defaultOpen?: boolean }) {
  const verdictColor =
    claim.verdict === "true"
      ? "var(--verdict-true)"
      : claim.verdict === "false"
      ? "var(--verdict-false)"
      : "var(--verdict-half)";

  return (
    <details className="bg-card border border-border" style={{ borderRadius: 4 }} open={defaultOpen}>
      <summary className="cursor-pointer px-4 py-3 select-none">
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <span className="font-bold text-sm">{claim.politician.name}</span>
          <span className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-foreground-muted">
            <span
              className="font-bold px-1.5 py-0.5 text-white"
              style={{ background: verdictColor, borderRadius: 2 }}
            >
              {claim.verdict === "true" ? "אמת" : claim.verdict === "false" ? "שקר" : "חצי"}
            </span>
            <span>{claim.status}</span>
            <span>{claim.editorApproved ? "✓" : "·"}</span>
            <span>{claim.createdAt.toLocaleDateString("he-IL", { day: "numeric", month: "short" })}</span>
          </span>
        </div>
        <div className="text-[13px] text-foreground line-clamp-2">{claim.quote}</div>
        {claim.verifierNotes && (
          <div className="text-[11px] text-foreground-muted mt-1.5 italic">
            הערות בודק: {claim.verifierNotes}
          </div>
        )}
      </summary>

      <div className="border-t border-border px-4 py-3 space-y-3 bg-background">
        {/* Update form */}
        <form action={updateClaim} className="space-y-3">
          <input type="hidden" name="key" value={adminKey} />
          <input type="hidden" name="id" value={claim.id} />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-foreground-muted font-bold">פסק דין</span>
              <select
                name="verdict"
                defaultValue={claim.verdict}
                className="bg-card border border-border text-sm py-1.5 px-2"
                style={{ borderRadius: 4 }}
              >
                <option value="true">אמת</option>
                <option value="half-true">חצי אמת</option>
                <option value="false">שקר</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-foreground-muted font-bold">סטטוס</span>
              <select
                name="status"
                defaultValue={claim.status}
                className="bg-card border border-border text-sm py-1.5 px-2"
                style={{ borderRadius: 4 }}
              >
                <option value="published">פורסם</option>
                <option value="draft">טיוטה</option>
                <option value="review">בבדיקה</option>
                <option value="rejected">נדחה</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-foreground-muted font-bold">אישור עורך</span>
              <select
                name="editorApproved"
                defaultValue={claim.editorApproved ? "true" : "false"}
                className="bg-card border border-border text-sm py-1.5 px-2"
                style={{ borderRadius: 4 }}
              >
                <option value="true">אושר ✓</option>
                <option value="false">לא אושר ✗</option>
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-foreground-muted font-bold">סיכום (TL;DR)</span>
            <textarea
              name="summary"
              defaultValue={claim.summary ?? ""}
              rows={2}
              className="bg-card border border-border text-sm py-1.5 px-2 resize-y"
              style={{ borderRadius: 4 }}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-foreground-muted font-bold">הסבר מלא</span>
            <textarea
              name="explanation"
              defaultValue={claim.explanation}
              rows={5}
              className="bg-card border border-border text-sm py-1.5 px-2 resize-y"
              style={{ borderRadius: 4 }}
            />
          </label>

          {/* Correction note — required when amending or hiding a
              previously-public claim. Drives the /corrections log. */}
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-foreground-muted font-bold">
              סיבת התיקון / ההסרה
              <span className="text-foreground-muted/70 normal-case tracking-normal mr-2">
                · חובה אם משנים טענה ציבורית
              </span>
            </span>
            <textarea
              name="correctionNote"
              defaultValue={claim.correctionNote ?? ""}
              rows={2}
              placeholder="לדוגמה: הוסר — הציטוט הוא דיווח עיתונאי, לא אמירה של הפוליטיקאי"
              className="bg-card border border-border text-sm py-1.5 px-2 resize-y"
              style={{ borderRadius: 4 }}
            />
            {claim.correctedAt && (
              <span className="text-[10px] text-foreground-muted">
                תיקון אחרון: {claim.correctedAt.toLocaleString("he-IL")}
              </span>
            )}
          </label>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              className="bg-accent text-white font-bold text-sm py-2 px-4"
              style={{ borderRadius: 4 }}
            >
              שמור
            </button>
            <a
              href={`/claim/${claim.id}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-foreground-muted hover:text-foreground border border-border py-2 px-3"
              style={{ borderRadius: 4 }}
            >
              צפה בעמוד הציבורי ↗
            </a>
            {claim.confidence != null && (
              <span className="text-[11px] text-foreground-muted tabular-nums">
                AI confidence: {(claim.confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
        </form>

        {/* Delete form (separate to avoid nested forms) */}
        <form action={deleteClaim} className="pt-2 border-t border-border">
          <input type="hidden" name="key" value={adminKey} />
          <input type="hidden" name="id" value={claim.id} />
          <button
            type="submit"
            className="text-xs text-red-700 hover:text-red-900 underline"
          >
            מחק טענה לצמיתות
          </button>
        </form>
      </div>
    </details>
  );
}

