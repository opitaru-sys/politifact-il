import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { PoliticianAvatar } from "@/components/PoliticianAvatar";
import { VerdictBadge } from "@/components/VerdictBadge";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "תיקונים | בדוק",
  description: "כל הטענות שהוסרו או תוקנו מהאתר, מסיבה ותאריך.",
};

/**
 * Public corrections log.
 *
 * Lists every claim that was once publicly visible and has since been
 * removed or amended. The schema fields that drive this page are
 * `correctionNote` (Hebrew, free-text) + `correctedAt` (DateTime),
 * set by:
 *   - The sweep scripts (sweep-news-narrative, sweep-unverifiable,
 *     sweep-rhetoric, sweep-knesset-rollcalls) when they un-approve
 *     a publicly-visible claim.
 *   - The admin claim editor when a manual correction is made.
 *   - The backfill script (scripts/backfill-corrections.mts) which
 *     populates historical corrections we know about.
 *
 * Claims with `correctionNote=null` aren't shown — that's the bulk
 * of `editorApproved=false` rows where the reason wasn't tracked.
 * Adding them with a generic "removed for quality" message would
 * dilute the trust signal; better to be silent on what we can't
 * explain. (See backfill-corrections.mts for the heuristic.)
 *
 * Server component, fetches directly with Prisma. Cap at 100
 * corrections per page (newest first) for a v1; pagination/filter
 * can come later if the list grows.
 */
export default async function CorrectionsPage() {
  const corrections = await prisma.claim.findMany({
    where: { correctionNote: { not: null } },
    orderBy: [{ correctedAt: "desc" }, { updatedAt: "desc" }],
    take: 200,
    include: { politician: { select: { id: true, name: true, party: true, image: true } } },
  });

  const total = await prisma.claim.count({
    where: { correctionNote: { not: null } },
  });

  return (
    <div>
      <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-2">
        שקיפות
      </div>
      <h1 className="text-4xl font-black mb-3 tracking-tight">תיקונים</h1>
      <p className="text-sm text-foreground-muted mb-3 max-w-2xl leading-relaxed">
        כל טענה שהופיעה באתר ולאחר מכן הוסרה או תוקנה מתועדת כאן.
        זוהי מחויבותנו הציבורית: לא לטאטא טעויות מתחת לשטיח אלא לתעד אותן.
      </p>
      <p className="text-sm text-foreground-muted mb-8 max-w-2xl leading-relaxed">
        סך הכל {total} תיקונים. מציג את {Math.min(corrections.length, total)} האחרונים.
      </p>

      {total === 0 ? (
        <div
          className="bg-card border border-border p-8 text-center text-foreground-muted text-sm"
          style={{ borderRadius: 4 }}
        >
          טרם בוצעו תיקונים. <br />
          <span className="text-[11px]">
            הדף יתעדכן ברגע שטענה ציבורית כלשהי תוסר או תתוקן.
          </span>
        </div>
      ) : (
        <ol className="space-y-3">
          {corrections.map((c) => (
            <li
              key={c.id}
              className="bg-card border border-border p-5"
              style={{ borderRadius: 4 }}
            >
              <div className="flex items-start justify-between gap-3 mb-3 pb-3 border-b border-border">
                <Link
                  href={`/politician/${c.politician.id}`}
                  className="flex items-center gap-3 group min-w-0"
                >
                  <PoliticianAvatar
                    id={c.politician.id}
                    name={c.politician.name}
                    image={c.politician.image}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <div className="font-bold text-sm group-hover:text-accent truncate">
                      {c.politician.name}
                    </div>
                    <div className="text-[11px] text-foreground-muted truncate">
                      {c.politician.party}
                    </div>
                  </div>
                </Link>
                <div className="text-right shrink-0">
                  <VerdictBadge verdict={c.verdict as "true" | "half-true" | "false"} />
                  <div className="text-[10px] text-foreground-muted mt-1.5 tabular-nums">
                    הוסר{" "}
                    {(c.correctedAt ?? c.updatedAt).toLocaleDateString("he-IL", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </div>
                </div>
              </div>

              <blockquote className="text-sm md:text-base font-bold mb-3 leading-snug pr-4 border-r-[3px] border-border-strong">
                &ldquo;{c.quote}&rdquo;
              </blockquote>

              <div
                className="text-[12px] text-foreground-muted leading-relaxed px-3 py-2 border border-border"
                style={{ borderRadius: 2 }}
              >
                <strong className="text-foreground">סיבת ההסרה:</strong>{" "}
                {c.correctionNote}
              </div>
            </li>
          ))}
        </ol>
      )}

      <div
        className="mt-10 pt-6 border-t border-border text-[12px] text-foreground-muted leading-relaxed max-w-2xl"
      >
        <p className="mb-2">
          <strong className="text-foreground">תאריך ההסרה</strong> משקף מתי הטענה הוסרה ממה שמוצג לציבור. הציטוט המקורי
          נשמר לצרכי תיעוד אך אינו מופיע יותר באתר הציבורי.
        </p>
        <p>
          מצאתם שגיאה שלא הוסרה?{" "}
          <Link href="/about#takedown" className="underline hover:text-accent">
            כך מדווחים
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
