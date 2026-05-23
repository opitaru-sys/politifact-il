import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Start of today in Israel local time, returned as a UTC `Date` so it
 * can be used directly in Prisma `gte` filters. We deliberately use
 * Israel time (not UTC) because the admin viewer is in Israel and
 * "today's activity" means "since midnight Asia/Jerusalem", not since
 * 00:00 UTC (which would land at 03:00 IDT and lose 3h of activity).
 *
 * Handles DST automatically — `Intl.DateTimeFormat` with timeZone
 * returns the correct offset for the moment, so this works year-round
 * without a manual summer/winter switch.
 */
/**
 * One column inside the "פעילות יומית" four-tile card. Hoisted to
 * module scope (rather than defined inside the render IIFE) so the
 * `react-hooks/static-components` rule passes — defining a component
 * during render creates a fresh component type on every paint, which
 * confuses React's reconciler.
 */
function CountCell({
  value,
  label,
  highlight,
}: {
  value: number;
  label: string;
  highlight?: boolean;
}) {
  const color = highlight
    ? "var(--verdict-true)"
    : value > 0
    ? "var(--foreground)"
    : "var(--foreground-muted)";
  return (
    <div className="px-4 py-4 border-l border-border last:border-l-0 text-center">
      <div className="text-2xl font-black tabular-nums leading-none" style={{ color }}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-foreground-muted mt-1.5">
        {label}
      </div>
    </div>
  );
}

function todayMidnightIsrael(): Date {
  const now = new Date();
  // Parts of "now" expressed in Asia/Jerusalem.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  // The current UTC offset for Asia/Jerusalem (e.g. "+03:00" in
  // summer, "+02:00" in winter). longOffset gives a parseable form.
  const offsetPart = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    timeZoneName: "longOffset",
  })
    .formatToParts(now)
    .find((p) => p.type === "timeZoneName")?.value; // e.g. "GMT+03:00"
  const offset = offsetPart?.replace("GMT", "") || "+03:00";
  return new Date(`${y}-${m}-${d}T00:00:00${offset}`);
}

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

/**
 * Cron schedules from .github/workflows. Hardcoded so the admin doesn't
 * need to hit the GitHub API to show "next run". Times are in UTC; the
 * UI shows them in IL local time.
 */
const SCHEDULES = [
  {
    name: "תור RSS — איסוף פיד",
    cron: "כל 30 דקות (00, 30)",
    nextFromNow: () => {
      const now = new Date();
      const next = new Date(now);
      // Round up to next 00 or 30 minute boundary
      const mins = now.getMinutes();
      next.setSeconds(0, 0);
      if (mins < 30) next.setMinutes(30);
      else next.setMinutes(60);
      return next;
    },
    description: "מושך כותרות חדשות מ-14 מקורות. לא קורא ל-AI, רק שומר כתבות.",
  },
  {
    name: "בדיקה של חדשות טריות",
    cron: "כל שעתיים, בשעה עגולה",
    nextFromNow: () => {
      const now = new Date();
      const next = new Date(now);
      next.setSeconds(0, 0);
      next.setMinutes(0);
      // Round up to next even hour
      const hr = now.getUTCHours();
      const nextHour = hr % 2 === 0 && now.getUTCMinutes() === 0 ? hr + 2 : hr + (2 - (hr % 2));
      next.setUTCHours(nextHour, 0, 0, 0);
      if (next.getTime() <= now.getTime()) next.setUTCHours(next.getUTCHours() + 2);
      return next;
    },
    description: "מעבד עד 30 כתבות RSS חדשות. עם Google Search. הצינור הציבורי.",
  },
  {
    name: "ריצה יומית מלאה",
    cron: "06:00 + 07:00 UTC (09:00 + 10:00 בארץ)",
    nextFromNow: () => {
      const now = new Date();
      const next = new Date(now);
      next.setUTCSeconds(0, 0);
      next.setUTCHours(6, 0, 0, 0);
      if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
      return next;
    },
    description: "כל הלאנים: RSS מלא, ייבוא כנסת, וכל הליקוטים מהיום הקודם.",
  },
];

function formatHHMM(d: Date): string {
  return d.toLocaleString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jerusalem",
  });
}

function bucketQueueByAge(articles: { fetchedAt: Date }[]): Record<string, number> {
  const now = Date.now();
  const buckets: Record<string, number> = { "<30דק": 0, "30דק-1ש": 0, "1-3ש": 0, "3-24ש": 0, ">24ש": 0 };
  for (const a of articles) {
    const minutes = (now - a.fetchedAt.getTime()) / 60_000;
    if (minutes < 30) buckets["<30דק"]++;
    else if (minutes < 60) buckets["30דק-1ש"]++;
    else if (minutes < 180) buckets["1-3ש"]++;
    else if (minutes < 1440) buckets["3-24ש"]++;
    else buckets[">24ש"]++;
  }
  return buckets;
}

function timeUntil(d: Date): string {
  const sec = Math.floor((d.getTime() - Date.now()) / 1000);
  if (sec < 60) return "בכל רגע";
  const min = Math.floor(sec / 60);
  if (min < 60) return `בעוד ${min} דק׳`;
  const hr = Math.floor(min / 60);
  const remainder = min % 60;
  return `בעוד ${hr}ש ${remainder > 0 ? `${remainder}דק׳` : ""}`.trim();
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

  // Start-of-today in Israel time. All "פעילות יומית" counts below
  // are gated on this cutoff so the card answers "what has the
  // pipeline produced since midnight in Israel?" — independent of
  // whether a DailySnapshot row exists or when the cron last ran.
  const todayStart = todayMidnightIsrael();

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
    unprocessedArticlesForAge,
    todayClaimsCreated,
    todayClaimsApproved,
    todayClaimsPublished,
    todayArticlesFetched,
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
    // Use bare boolean column (`WHEN processed` not `WHEN processed = 1`)
    // for portability — SQLite stores Boolean as INTEGER 0/1 and Postgres
    // uses native bool, but bare column evaluation works on both.
    prisma.$queryRaw<{ source: string; total: bigint; processed: bigint; unprocessed: bigint; lastFetched: string | number | bigint | Date | null }[]>`
      SELECT
        source,
        COUNT(*) as total,
        SUM(CASE WHEN processed THEN 1 ELSE 0 END) as processed,
        SUM(CASE WHEN NOT processed THEN 1 ELSE 0 END) as unprocessed,
        MAX("fetchedAt") as "lastFetched"
      FROM "Article"
      GROUP BY source
      ORDER BY total DESC
    `,
    (() => {
      const cutoff30 = new Date();
      cutoff30.setDate(cutoff30.getDate() - 30);
      return prisma.$queryRaw<{ politicianId: string; cnt: bigint; cnt30: bigint }[]>`
        SELECT
          "politicianId",
          COUNT(*) as cnt,
          SUM(CASE WHEN date >= ${cutoff30} THEN 1 ELSE 0 END) as cnt30
        FROM "Claim"
        WHERE status = 'published'
        GROUP BY "politicianId"
        ORDER BY cnt DESC
        LIMIT 10
      `;
    })(),
    prisma.claim.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { politician: { select: { name: true } } },
    }),
    // Queue age data — used to explain *why* articles are waiting.
    prisma.article.findMany({
      where: { processed: false },
      select: { fetchedAt: true, source: true },
    }),
    // "פעילות יומית" — four counts, all gated on Israel-midnight cutoff.
    // Queried fresh on every page load so the card shows real activity,
    // not a snapshot-vs-snapshot diff that needed yesterday's row.
    prisma.claim.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.claim.count({
      where: { editorApproved: true, verifiedAt: { gte: todayStart } },
    }),
    prisma.claim.count({
      where: { status: "published", createdAt: { gte: todayStart } },
    }),
    prisma.article.count({ where: { fetchedAt: { gte: todayStart } } }),
  ]);

  // Bucket the queue by age so the admin sees "13 from the last hour, 17 from
  // 1-6h ago" instead of just a total. Makes "why is there a queue" concrete.
  const queueAge = bucketQueueByAge(unprocessedArticlesForAge);

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

      <AdminNav adminKey={key} />

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

      {/* Pipeline schedule — when each automated workflow runs next.
          Reads from hardcoded SCHEDULES (matched to .github/workflows).
          No API call needed; the next-fire times are computed locally. */}
      <section className="mt-10">
        <div className="flex items-baseline justify-between mb-3 pb-2 border-b-[1.5px] border-border-strong">
          <h2 className="font-black text-lg tracking-tight">לוח זמנים אוטומטי</h2>
          <span className="text-[11px] uppercase tracking-wider text-foreground-muted">
            ריצות מתוזמנות
          </span>
        </div>
        <div
          className="bg-card border border-border overflow-hidden"
          style={{ borderRadius: 4 }}
        >
          {SCHEDULES.map((s) => {
            const next = s.nextFromNow();
            return (
              <div
                key={s.name}
                className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-center px-4 py-3 border-b border-border last:border-b-0 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-bold truncate">{s.name}</div>
                  <div className="text-[11px] text-foreground-muted truncate">{s.description}</div>
                </div>
                <div className="text-[11px] text-foreground-muted tabular-nums whitespace-nowrap">{s.cron}</div>
                <div className="text-left tabular-nums whitespace-nowrap">
                  <div className="font-bold text-sm">{formatHHMM(next)}</div>
                  <div className="text-[10px] text-foreground-muted uppercase tracking-wider">
                    {timeUntil(next)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Queue age — when will the current 30 articles get processed?
          Each bucket tells the reader "this many articles are waiting for
          the next fresh-process tick at HH:MM". Removes the "why is it
          stuck" mystery. */}
      {unprocessedTotal > 0 && (
        <section className="mt-10">
          <div className="flex items-baseline justify-between mb-3 pb-2 border-b-[1.5px] border-border-strong">
            <h2 className="font-black text-lg tracking-tight">פירוט התור</h2>
            <span className="text-[11px] uppercase tracking-wider text-foreground-muted">
              {unprocessedTotal} כתבות ממתינות
            </span>
          </div>
          <div className="bg-card border border-border p-4 text-sm" style={{ borderRadius: 4 }}>
            <div className="grid grid-cols-5 gap-3 text-center">
              {Object.entries(queueAge).map(([bucket, count]) => (
                <div key={bucket}>
                  <div
                    className="font-black text-2xl tabular-nums"
                    style={{ color: count > 0 ? "var(--verdict-half)" : "var(--foreground-muted)" }}
                  >
                    {count}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-foreground-muted mt-1">
                    {bucket}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-foreground-muted leading-relaxed mt-4 pt-4 border-t border-border">
              כתבות שנשאבו ב-48 השעות האחרונות מועברות ללוח &ldquo;בדיקה של חדשות טריות&rdquo;
              שרץ כל שעתיים בשעות הזוגיות. כתבות ישנות יותר ממתינות ללוח backlog שרץ פעם ביום.
            </p>
          </div>
        </section>
      )}

      {/* "פעילות יומית" — live counts since midnight Israel time.
          Queried fresh on every admin page load (no dependency on
          DailySnapshot snapshots or yesterday's row), so the numbers
          are always up-to-the-minute. */}
      {(() => {
        // Today's approval rate: of the claims created today and
        // marked published, what fraction passed the verifier? Uses
        // published-today (not all created-today) as denominator so
        // claims still in draft don't drag the percentage down.
        const todayPct =
          todayClaimsPublished > 0
            ? Math.round((todayClaimsApproved / todayClaimsPublished) * 100)
            : 0;

        const todayLabel = todayStart.toLocaleDateString("he-IL", {
          day: "numeric",
          month: "long",
        });

        return (
          <section className="mt-10">
            <div className="flex items-baseline justify-between mb-3 pb-2 border-b-[1.5px] border-border-strong">
              <h2 className="font-black text-lg tracking-tight">פעילות יומית</h2>
              <span className="text-[11px] uppercase tracking-wider text-foreground-muted">
                מאז חצות · {todayLabel}
              </span>
            </div>
            <div
              className="bg-card border border-border-strong grid grid-cols-2 sm:grid-cols-4"
              style={{ borderRadius: 4 }}
            >
              <CountCell value={todayClaimsCreated} label="טענות חדשות" />
              <CountCell value={todayClaimsApproved} label="אושרו היום" />
              <CountCell value={todayArticlesFetched} label="כתבות חדשות" />
              <div className="px-4 py-4 text-center">
                <div
                  className="text-2xl font-black tabular-nums leading-none"
                  style={{ color: "var(--verdict-true)" }}
                >
                  {todayPct}%
                </div>
                <div className="text-[10px] uppercase tracking-wider text-foreground-muted mt-1.5">
                  אחוז אישור היום
                </div>
              </div>
            </div>
            <p className="text-[11px] text-foreground-muted leading-relaxed mt-3">
              נספר מאז חצות (שעון ישראל). כולל כל מה שה-cron כבר הספיק לעבד היום
              מתוך {todayClaimsPublished} טענות שפורסמו.
            </p>
          </section>
        );
      })()}

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
            סה״כ · 30 ימים אחרונים
          </span>
        </div>
        <div
          className="bg-card border border-border overflow-hidden"
          style={{ borderRadius: 4 }}
        >
          <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 px-4 py-2 border-b border-border text-[10px] uppercase tracking-wider text-foreground-muted font-bold">
            <span>#</span>
            <span>פוליטיקאי</span>
            <span className="text-left tabular-nums">סה״כ</span>
            <span className="text-left tabular-nums">30 ימים</span>
          </div>
          {topPoliticiansRaw.map((p, i) => (
            <a
              key={p.politicianId}
              href={`/politician/${p.politicianId}`}
              className="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 items-center px-4 py-2 border-b border-border last:border-b-0 text-sm hover:bg-muted/40"
            >
              <span className="text-[11px] font-black text-foreground-muted tabular-nums w-6">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="font-bold">{p.politicianId}</span>
              <span className="tabular-nums font-bold text-left">{Number(p.cnt)}</span>
              <span className="tabular-nums text-left text-foreground-muted">{Number(p.cnt30)}</span>
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

function AdminNav({ adminKey }: { adminKey: string }) {
  return (
    <nav className="flex items-center gap-1 text-[11px] tracking-wider uppercase">
      <span className="text-foreground font-bold border-b-2 border-accent pb-1 ml-3">סטטוס</span>
      <a
        href={`/admin/claims?key=${adminKey}`}
        className="text-foreground-muted hover:text-foreground font-medium border-b-2 border-transparent pb-1 ml-3"
      >
        עריכת טענות →
      </a>
      <a
        href={`/admin/reports?key=${adminKey}`}
        className="text-foreground-muted hover:text-foreground font-medium border-b-2 border-transparent pb-1"
      >
        דיווחים →
      </a>
    </nav>
  );
}
