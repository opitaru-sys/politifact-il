import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ key?: string }>;
}

interface SourceStats {
  source: string;
  total: number;
  processed: number;
  unprocessed: number;
  lastFetched: Date | null;
}

interface PoliticianClaimCount {
  politicianId: string;
  cnt: bigint;
}

function formatRelative(d: Date | null): string {
  if (!d) return "אין";
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return `${sec}ש`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}דק`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}שע`;
  const days = Math.floor(hr / 24);
  return `${days}ימ`;
}

function formatExact(d: Date | null): string {
  if (!d) return "אין";
  return d.toLocaleString("he-IL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminStatusPage({ searchParams }: PageProps) {
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

  // Parallel data fetch
  const [
    totalClaims,
    publishedClaims,
    editorApproved,
    totalArticles,
    unprocessedTotal,
    pendingReports,
    totalComments,
    lastClaim,
    lastArticle,
    sourceRowsRaw,
    topPoliticiansRaw,
    recentClaims,
  ] = await Promise.all([
    prisma.claim.count(),
    prisma.claim.count({ where: { status: "published" } }),
    prisma.claim.count({ where: { editorApproved: true } }),
    prisma.article.count(),
    prisma.article.count({ where: { processed: false } }),
    prisma.report.count(),
    prisma.comment.count(),
    prisma.claim.findFirst({
      where: { status: "published" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.article.findFirst({
      orderBy: { fetchedAt: "desc" },
      select: { fetchedAt: true },
    }),
    prisma.$queryRaw<{ source: string; total: bigint; processed: bigint; unprocessed: bigint; lastFetched: string | number | bigint | null }[]>`
      SELECT
        source,
        COUNT(*) as total,
        SUM(CASE WHEN processed = 1 THEN 1 ELSE 0 END) as processed,
        SUM(CASE WHEN processed = 0 THEN 1 ELSE 0 END) as unprocessed,
        MAX(fetchedAt) as lastFetched
      FROM Article
      GROUP BY source
      ORDER BY total DESC
    `,
    prisma.$queryRaw<PoliticianClaimCount[]>`
      SELECT politicianId, COUNT(*) as cnt
      FROM Claim
      WHERE status = 'published'
      GROUP BY politicianId
      ORDER BY cnt DESC
      LIMIT 10
    `,
    prisma.claim.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { politician: { select: { name: true } } },
    }),
  ]);

  const sourceRows: SourceStats[] = sourceRowsRaw.map((r) => {
    let lastFetched: Date | null = null;
    if (r.lastFetched !== null && r.lastFetched !== undefined) {
      // SQLite via Prisma may return MAX() of a DateTime column as a BigInt (epoch ms),
      // a number, or an ISO string depending on schema. Normalize.
      if (typeof r.lastFetched === "bigint") {
        lastFetched = new Date(Number(r.lastFetched));
      } else if (typeof r.lastFetched === "number") {
        lastFetched = new Date(r.lastFetched);
      } else {
        lastFetched = new Date(r.lastFetched);
      }
    }
    return {
      source: r.source,
      total: Number(r.total),
      processed: Number(r.processed),
      unprocessed: Number(r.unprocessed),
      lastFetched,
    };
  });

  return (
    <div>
      <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-2">אדמין · סטטוס</div>
      <h1 className="text-3xl font-black mb-2 tracking-tight">מצב הצינור</h1>
      <p className="text-sm text-foreground-muted mb-8">
        תצוגה חיה של עומק התור, זמן הריצה האחרונה, ופירוט לפי מקור. הדף הזה לא מוטמן ומציג מצב נוכחי מהמסד.
      </p>

      <AdminNav />

      {/* Top metric row */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-0 border border-border-strong mt-6"
        style={{ borderRadius: 4 }}
      >
        <Metric label="טענות בפרסום" value={publishedClaims} subtext={`מתוך ${totalClaims} בסה״כ`} />
        <Metric
          label="עברו בדיקה כפולה"
          value={editorApproved}
          subtext={`${publishedClaims > 0 ? Math.round((editorApproved / publishedClaims) * 100) : 0}% מהטענות · AI שני`}
          color="var(--verdict-true)"
        />
        <Metric
          label="בתור לעיבוד"
          value={unprocessedTotal}
          subtext={`מתוך ${totalArticles} כתבות`}
          color={unprocessedTotal > 100 ? "var(--verdict-half)" : "var(--verdict-true)"}
        />
        <Metric
          label="פעילות אחרונה"
          value={formatRelative(lastClaim?.createdAt ?? null)}
          subtext={formatExact(lastClaim?.createdAt ?? null)}
        />
      </div>

      {/* Per-source breakdown */}
      <section className="mt-10">
        <div className="flex items-baseline justify-between mb-3 pb-2 border-b-[1.5px] border-border-strong">
          <h2 className="font-black text-lg tracking-tight">פירוט לפי מקור</h2>
          <span className="text-[11px] uppercase tracking-wider text-foreground-muted">
            כתבה אחרונה: {formatRelative(lastArticle?.fetchedAt ?? null)}
          </span>
        </div>
        <div
          className="bg-card border border-border overflow-hidden"
          style={{ borderRadius: 4 }}
        >
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 px-4 py-2 border-b border-border text-[10px] uppercase tracking-wider text-foreground-muted font-bold">
            <span>מקור</span>
            <span className="text-left tabular-nums">סה״כ</span>
            <span className="text-left tabular-nums">עובד</span>
            <span className="text-left tabular-nums">בתור</span>
            <span className="text-left">אחרונה</span>
          </div>
          {sourceRows.map((r) => (
            <div
              key={r.source}
              className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 items-center px-4 py-2 border-b border-border last:border-b-0 text-sm"
            >
              <span className="font-bold truncate">{r.source}</span>
              <span className="tabular-nums text-left">{r.total}</span>
              <span className="tabular-nums text-left text-foreground-muted">{r.processed}</span>
              <span
                className="tabular-nums text-left font-bold"
                style={{ color: r.unprocessed > 0 ? "var(--verdict-half)" : "var(--foreground-muted)" }}
              >
                {r.unprocessed}
              </span>
              <span className="text-[11px] text-foreground-muted">{formatRelative(r.lastFetched)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Top politicians by claim count */}
      <section className="mt-10">
        <div className="flex items-baseline justify-between mb-3 pb-2 border-b-[1.5px] border-border-strong">
          <h2 className="font-black text-lg tracking-tight">פוליטיקאים מובילים</h2>
          <span className="text-[11px] uppercase tracking-wider text-foreground-muted">
            10 ראשונים בכמות טענות
          </span>
        </div>
        <div
          className="bg-card border border-border overflow-hidden"
          style={{ borderRadius: 4 }}
        >
          {topPoliticiansRaw.map((p, i) => (
            <a
              key={p.politicianId}
              href={`/politician/${p.politicianId}`}
              className="grid grid-cols-[auto_1fr_auto] gap-x-4 items-center px-4 py-2 border-b border-border last:border-b-0 text-sm hover:bg-muted/40"
            >
              <span className="text-[11px] font-black text-foreground-muted tabular-nums w-6">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="font-bold">{p.politicianId}</span>
              <span className="tabular-nums font-bold">{Number(p.cnt)}</span>
            </a>
          ))}
        </div>
      </section>

      {/* Recent claims feed */}
      <section className="mt-10">
        <h2 className="font-black text-lg tracking-tight mb-3 pb-2 border-b-[1.5px] border-border-strong">
          טענות אחרונות שנוצרו
        </h2>
        <div
          className="bg-card border border-border overflow-hidden"
          style={{ borderRadius: 4 }}
        >
          {recentClaims.map((c) => (
            <a
              key={c.id}
              href={`/claim/${c.id}`}
              className="block px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/40"
            >
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="text-xs font-bold">{c.politician.name}</span>
                <span className="text-[10px] uppercase tracking-wider text-foreground-muted">
                  {formatRelative(c.createdAt)} · {c.source}
                </span>
              </div>
              <div className="text-[11px] text-foreground-muted line-clamp-1">
                <span
                  className="font-bold ml-1"
                  style={{
                    color:
                      c.verdict === "true"
                        ? "var(--verdict-true)"
                        : c.verdict === "false"
                        ? "var(--verdict-false)"
                        : "var(--verdict-half)",
                  }}
                >
                  {c.verdict === "true" ? "אמת" : c.verdict === "false" ? "שקר" : "חצי"}:
                </span>
                {c.quote.slice(0, 100)}
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* Community signals */}
      <section className="mt-10 mb-12">
        <h2 className="font-black text-lg tracking-tight mb-3 pb-2 border-b-[1.5px] border-border-strong">
          קהילה
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <a
            href={`/admin/reports?key=${key}`}
            className="bg-card border border-border p-4 hover:bg-muted/40 transition-colors"
            style={{ borderRadius: 4 }}
          >
            <div className="text-[10px] uppercase tracking-wider text-foreground-muted">דיווחי שגיאה</div>
            <div className="text-3xl font-black tabular-nums mt-1">{pendingReports}</div>
            <div className="text-[11px] text-foreground-muted mt-1">לחץ לעיין →</div>
          </a>
          <div
            className="bg-card border border-border p-4"
            style={{ borderRadius: 4 }}
          >
            <div className="text-[10px] uppercase tracking-wider text-foreground-muted">תגובות</div>
            <div className="text-3xl font-black tabular-nums mt-1">{totalComments}</div>
            <div className="text-[11px] text-foreground-muted mt-1">סה״כ בכל הטענות</div>
          </div>
        </div>
      </section>

      {/* Refresh hint */}
      <p className="text-[11px] text-foreground-muted mt-6 leading-relaxed">
        טיפ: לרענון נוסף, רענן את העמוד (Ctrl+R). הנתונים אינם מוטמנים. הצינור היומי רץ דרך{" "}
        <code className="bg-muted px-1.5 py-0.5 text-[11px]" style={{ borderRadius: 2 }}>
          npm run daily
        </code>{" "}
        ומעבד עד 100 כתבות בכל ריצה.
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  subtext,
  color,
}: {
  label: string;
  value: number | string;
  subtext?: string;
  color?: string;
}) {
  return (
    <div className="px-4 py-4 border-l border-border last:border-l-0">
      <div className="text-[10px] uppercase tracking-wider text-foreground-muted mb-1.5">
        {label}
      </div>
      <div
        className="text-3xl font-black tabular-nums leading-none"
        style={color ? { color } : undefined}
      >
        {value}
      </div>
      {subtext && <div className="text-[11px] text-foreground-muted mt-1.5">{subtext}</div>}
    </div>
  );
}

function AdminNav() {
  return (
    <nav className="flex items-center gap-1 text-[11px] tracking-wider uppercase">
      <span className="text-foreground font-bold border-b-2 border-accent pb-1 ml-3">סטטוס</span>
      <a
        href={`/admin/reports`}
        className="text-foreground-muted hover:text-foreground font-medium border-b-2 border-transparent pb-1"
      >
        דיווחים →
      </a>
    </nav>
  );
}
