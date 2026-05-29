/**
 * Re-check a single claim with a fresh grounded fact-check, now WITH the
 * source article as context, and apply the result. Shared by the single-claim
 * admin re-check (/api/admin/recheck) and the bulk review drain
 * (/api/admin/review/recheck-batch).
 *
 *   confident + changed verdict -> republish corrected (+ /corrections note if
 *                                  the claim was already public)
 *   confident + same verdict    -> publish/confirm
 *   inconclusive                -> withhold to status="review"
 *
 * Does NOT revalidate paths or touch reports — the caller owns that. Throws
 * "Claim not found" if the id is unknown, or the fact-check error on failure.
 */
import { prisma } from "@/lib/db";
import { VERDICT_LABEL_HE } from "@/lib/feed";

export type RecheckOutcome = "corrected" | "confirmed" | "withheld";

export interface RecheckResult {
  outcome: RecheckOutcome;
  verdict: string;
  confidence: number;
  changed: boolean;
  /** True when a source article was found and fed in as context. */
  hadContext: boolean;
}

export async function recheckClaimById(claimId: string): Promise<RecheckResult> {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    select: {
      id: true,
      quote: true,
      topic: true,
      date: true,
      verdict: true,
      status: true,
      editorApproved: true,
      sourceUrl: true,
      politician: { select: { name: true } },
    },
  });
  if (!claim) throw new Error("Claim not found");

  // Recover the source article for context. Claims link to articles by
  // sourceUrl == Article.url (Article.url is unique). The article may be
  // absent for very old claims, in which case we re-check without context
  // (same as before this feature).
  const article = claim.sourceUrl
    ? await prisma.article.findFirst({
        where: { url: claim.sourceUrl },
        select: { title: true, content: true },
      })
    : null;

  // Lazy-import the heavy fact-check module so it isn't pulled into the
  // module graph of callers that never re-check.
  const {
    factCheckClaim,
    isConfidentlyVerified,
    isCircularVerification,
    isSelfSourcedUnverifiable,
  } = await import("@/lib/fact-check");

  const result = await factCheckClaim(
    {
      politicianName: claim.politician.name,
      quote: claim.quote,
      topic: claim.topic,
    },
    {
      claimDate: claim.date,
      articleTitle: article?.title,
      articleContext: article?.content,
    },
  );

  const wasPublic = claim.editorApproved && claim.status === "published";
  const circular = isCircularVerification(result);
  const selfSourced = isSelfSourcedUnverifiable(result);

  if (isConfidentlyVerified(result) && !circular && !selfSourced) {
    const changed = result.verdict !== claim.verdict;
    let correctionNote: string | null = null;
    if (wasPublic && changed) {
      const from = VERDICT_LABEL_HE[claim.verdict] ?? claim.verdict;
      const to = VERDICT_LABEL_HE[result.verdict] ?? result.verdict;
      correctionNote = `הפסק עודכן מ"${from}" ל"${to}" לאחר בדיקה חוזרת עם חיפוש מקורות.`;
    }
    await prisma.claim.update({
      where: { id: claim.id },
      data: {
        verdict: result.verdict,
        summary: result.summary,
        explanation: result.explanation,
        factSource: result.factSource,
        factSourceUrl: result.factSourceUrl,
        confidence: result.confidence,
        status: "published",
        editorApproved: true,
        verifiedAt: new Date(),
        verifierNotes: "אומת מחדש בבדיקה חוזרת (אדמין)",
        ...(correctionNote ? { correctionNote, correctedAt: new Date() } : {}),
      },
    });
    return {
      outcome: changed ? "corrected" : "confirmed",
      verdict: result.verdict,
      confidence: result.confidence,
      changed,
      hadContext: Boolean(article?.content),
    };
  }

  await prisma.claim.update({
    where: { id: claim.id },
    data: {
      status: "review",
      editorApproved: false,
      verifiedAt: new Date(),
      verifierNotes: circular
        ? "הפסק מאמת רק שהפוליטיקאי אמר זאת, לא את נכונות התוכן (אימות מעגלי). דרושה הכרעה אנושית."
        : selfSourced
        ? "התוכן אינו ניתן לאימות עצמאי (מקורו בדברי הפוליטיקאי / הצהרת כוונה). דרושה הכרעה אנושית."
        : "בדיקה חוזרת לא אימתה את הטענה. דרושה הכרעה אנושית.",
    },
  });
  return {
    outcome: "withheld",
    verdict: result.verdict,
    confidence: result.confidence,
    changed: false,
    hadContext: Boolean(article?.content),
  };
}
