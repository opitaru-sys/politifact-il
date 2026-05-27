import { prisma } from "@/lib/db";
import { deleteComment } from "../_actions";
import { AdminNav } from "@/components/AdminNav";
import { bootstrapLegacyKey, requireAdmin } from "@/lib/admin-auth";

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

export default async function AdminCommentsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  await bootstrapLegacyKey(sp, "/admin/comments");
  await requireAdmin();

  // Most recent first, capped at 200 — moderation queue, not an archive.
  const comments = await prisma.comment.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      claim: {
        select: {
          id: true,
          quote: true,
          verdict: true,
          politicianId: true,
          politician: { select: { name: true, party: true } },
        },
      },
    },
  });

  return (
    <div>
      <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-2">
        אדמין · תגובות
      </div>
      <h1 className="text-3xl font-black mb-2 tracking-tight">
        תגובות אחרונות ({comments.length})
      </h1>
      <p className="text-sm text-foreground-muted mb-6">
        200 התגובות האחרונות מכל הטענות. לחץ <em>מחק</em> כדי להסיר תגובה
        (לא הפיך).
      </p>

      <AdminNav active="comments" />

      {comments.length === 0 ? (
        <div
          className="bg-card border border-border p-8 mt-6 text-center text-foreground-muted"
          style={{ borderRadius: 4 }}
        >
          אין תגובות עדיין. הן יופיעו כאן כשמשתמש יפרסם תגובה על טענה.
        </div>
      ) : (
        <div className="space-y-3 mt-6">
          {comments.map((c) => (
            <div
              key={c.id}
              className="bg-card border border-border p-4"
              style={{ borderRadius: 4 }}
            >
              {/* Header: author + politician + when */}
              <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-sm font-bold text-foreground">{c.author}</span>
                  <span className="text-[11px] text-foreground-muted">על</span>
                  <a
                    href={`/politician/${c.claim.politicianId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-bold hover:text-accent"
                  >
                    {c.claim.politician.name}
                  </a>
                  <span className="text-[11px] text-foreground-muted">
                    · {c.claim.politician.party}
                  </span>
                  <span
                    className="text-[10px] uppercase tracking-wider font-bold text-white bg-foreground-muted/40 px-2 py-0.5"
                    style={{ borderRadius: 2 }}
                  >
                    {c.claim.verdict}
                  </span>
                </div>
                <span className="text-[11px] text-foreground-muted tabular-nums">
                  {formatTime(c.createdAt)}
                </span>
              </div>

              {/* The comment body itself */}
              <div
                className="bg-background border border-border p-3 my-2 text-sm whitespace-pre-line leading-relaxed"
                style={{ borderRadius: 2 }}
              >
                {c.body}
              </div>

              {/* The claim it's responding to (truncated) */}
              <blockquote className="text-[12px] text-foreground-muted my-2 border-r-2 border-border pr-3 leading-relaxed">
                בתגובה ל: &ldquo;{c.claim.quote.slice(0, 140)}
                {c.claim.quote.length > 140 ? "…" : ""}&rdquo;
              </blockquote>

              {/* Actions */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border flex-wrap">
                <form action={deleteComment}>
                  <input type="hidden" name="id" value={c.id} />
                  <button
                    type="submit"
                    className="text-[11px] font-bold uppercase tracking-wider bg-press-red text-white py-1.5 px-3 hover:opacity-90 cursor-pointer"
                    style={{ borderRadius: 2 }}
                    title="מחיקה לצמיתות. לא הפיך."
                  >
                    מחק
                  </button>
                </form>
                <a
                  href={`/claim/${c.claim.id}#comments`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] font-bold uppercase tracking-wider border border-border hover:border-accent hover:text-accent py-1.5 px-3"
                  style={{ borderRadius: 2 }}
                  title="פתח את הטענה כפי שהציבור רואה"
                >
                  צפייה ציבורית ↗
                </a>
                <span className="text-[10px] text-foreground-muted opacity-50 mr-auto">
                  תגובה #{c.id.slice(-6)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
