import { prisma } from "@/lib/db";
import { updateClaim } from "../_actions";
import { AdminNav } from "@/components/AdminNav";
import { RecheckClaimButton } from "@/components/RecheckClaimButton";
import { bootstrapLegacyKey, requireAdmin } from "@/lib/admin-auth";
import { VERDICT_LABEL_HE } from "@/lib/feed";

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

export default async function AdminReviewPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  await bootstrapLegacyKey(sp, "/admin/review");
  await requireAdmin();

  // The withhold queue: claims an automatic check couldn't verify with
  // confidence, so they were pulled from the public site (status="review")
  // instead of being published as a misleading "half-true". This is the
  // "ask a human" pile — the AI declined to guess.
  const claims = await prisma.claim.findMany({
    where: { status: "review" },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { politician: true },
  });

  return (
    <div>
      <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-2">
        אדמין · בדיקה אנושית
      </div>
      <h1 className="text-3xl font-black mb-2 tracking-tight">
        ממתינות לבדיקה אנושית ({claims.length})
      </h1>
      <p className="text-sm text-foreground-muted mb-6 max-w-2xl leading-relaxed">
        טענות שבדיקה אוטומטית לא הצליחה לאמת בביטחון, אז הן הוסתרו מהציבור עד
        להכרעה. לחצו &ldquo;בדוק מחדש עם חיפוש מקורות&rdquo; כדי להריץ בדיקה אמיתית
        עם חיפוש: אם היא מאמתת, הטענה תפורסם אוטומטית; אם לא, היא תישאר כאן
        לבדיקה ידנית.
      </p>

      <AdminNav active="review" />

      {claims.length === 0 ? (
        <div
          className="bg-card border border-border p-8 mt-6 text-center text-foreground-muted"
          style={{ borderRadius: 4 }}
        >
          אין טענות הממתינות לבדיקה. כשבדיקה אוטומטית לא מצליחה לאמת טענה, היא
          תופיע כאן במקום להתפרסם.
        </div>
      ) : (
        <div className="space-y-3 mt-6">
          {claims.map((c) => (
            <ReviewCard key={c.id} claim={c} />
          ))}
        </div>
      )}
    </div>
  );
}

type ReviewRow = Awaited<
  ReturnType<typeof prisma.claim.findMany<{ include: { politician: true } }>>
>[number];

function ReviewCard({ claim: c }: { claim: ReviewRow }) {
  const verdictColor =
    c.verdict === "true"
      ? "var(--verdict-true)"
      : c.verdict === "false"
      ? "var(--verdict-false)"
      : "var(--verdict-half)";

  return (
    <div className="bg-card border border-border p-4" style={{ borderRadius: 4 }}>
      {/* Header */}
      <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            className="font-bold px-1.5 py-0.5 text-white text-[10px] uppercase tracking-wider"
            style={{ background: verdictColor, borderRadius: 2 }}
          >
            {VERDICT_LABEL_HE[c.verdict] ?? c.verdict}
          </span>
          <a
            href={`/politician/${c.politicianId}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-bold hover:text-accent"
          >
            {c.politician.name}
          </a>
          <span className="text-[11px] text-foreground-muted">
            · {c.politician.party}
          </span>
        </div>
        <span className="text-[11px] text-foreground-muted tabular-nums">
          {formatTime(c.createdAt)}
        </span>
      </div>

      {/* Quote */}
      <blockquote className="text-sm text-foreground my-2 border-r-2 border-border pr-3">
        &ldquo;{c.quote}&rdquo;
      </blockquote>

      {/* Why it's here */}
      {c.verifierNotes && (
        <div className="text-[11px] text-amber-700 mb-2 italic">
          {c.verifierNotes}
        </div>
      )}

      {/* Current explanation, collapsed */}
      <details className="text-[12px] text-foreground-muted mb-2">
        <summary className="cursor-pointer font-bold text-foreground">
          ההסבר הנוכחי (לחצו להצגה)
        </summary>
        <div
          className="mt-2 p-2 bg-background border border-border text-foreground leading-relaxed whitespace-pre-line"
          style={{ borderRadius: 2 }}
        >
          {c.explanation}
          {c.confidence != null && (
            <span className="block mt-2 text-[10px] text-foreground-muted tabular-nums">
              ביטחון AI: {(c.confidence * 100).toFixed(0)}%
            </span>
          )}
        </div>
      </details>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border flex-wrap">
        <RecheckClaimButton claimId={c.id} />
        {/* Dismiss: not publishable, drop it from the queue (status=rejected).
            Reversible from the full editor. */}
        <form action={updateClaim}>
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="status" value="rejected" />
          <input type="hidden" name="editorApproved" value="false" />
          <button
            type="submit"
            className="text-[11px] font-bold uppercase tracking-wider border border-border hover:border-accent hover:text-accent py-1.5 px-3 cursor-pointer"
            style={{ borderRadius: 2 }}
            title="דחה — לא יפורסם, יוסר מהתור (ניתן לשחזר בעריכה המלאה)"
          >
            דחה
          </button>
        </form>
        {/* Publish the current verdict as-is, for when you've judged it correct
            without needing a re-check. */}
        <form action={updateClaim}>
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="status" value="published" />
          <input type="hidden" name="editorApproved" value="true" />
          <button
            type="submit"
            className="text-[11px] font-bold uppercase tracking-wider border border-border hover:border-green-700 hover:text-green-700 py-1.5 px-3 cursor-pointer"
            style={{ borderRadius: 2 }}
            title="פרסם עם הפסק הנוכחי כפי שהוא"
          >
            פרסם כפי שהוא
          </button>
        </form>
        <a
          href={`/admin/claims?id=${c.id}`}
          className="text-[11px] text-foreground-muted hover:text-foreground py-1.5 px-3"
          title="עריכה מלאה: פסק, הסבר, סטטוס"
        >
          עריכה מלאה ←
        </a>
        <span className="text-[10px] text-foreground-muted opacity-50 mr-auto">
          טענה #{c.id.slice(-6)}
        </span>
      </div>
    </div>
  );
}
