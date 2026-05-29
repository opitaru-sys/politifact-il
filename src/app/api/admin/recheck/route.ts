/**
 * POST /api/admin/recheck
 *
 * Runs a REAL grounded fact-check (Google Search) on an existing claim and
 * acts on the result. This is the "actually check it" path that the LITE
 * report recommendation can't do — that one only rewords the explanation
 * without searching, which is exactly how the "Operation Roaring Lion" miss
 * slipped through.
 *
 *   confident + verdict changed -> republish with the corrected verdict,
 *                                  explanation and source; logs a public
 *                                  /corrections note if the claim was live.
 *   confident + verdict same    -> publish/confirm as-is.
 *   inconclusive                -> pull to status="review" for a human.
 *                                  Never guess from absence of evidence.
 *
 * Called from /admin/reports (pass reportId so the report is resolved) and
 * from /admin/review (the human-review queue the sweep + pipeline fill).
 *
 * Auth: cookie-based admin session, same as the rest of /api/admin/*.
 */
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";
import { VERDICT_LABEL_HE } from "@/lib/feed";

// One grounded fact-check takes ~20-30s. Without this the route would run on
// Vercel's short default timeout and get killed mid-check. 120s is ample for
// a single claim. (Pro plan ceiling is 300; the bulk /api/process needs that.)
export const maxDuration = 120;

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { claimId?: string; reportId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const claimId = typeof body.claimId === "string" ? body.claimId : "";
  const reportId = typeof body.reportId === "string" ? body.reportId : "";
  if (!claimId) {
    return NextResponse.json({ error: "Missing claimId" }, { status: 400 });
  }

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
      politician: { select: { name: true } },
    },
  });
  if (!claim) {
    return NextResponse.json({ error: "Claim not found" }, { status: 404 });
  }

  // Lazy-import the heavy fact-check module so it isn't pulled into the
  // module graph of routes that never re-check.
  const { factCheckClaim, isConfidentlyVerified } = await import(
    "@/lib/fact-check"
  );

  let result;
  try {
    result = await factCheckClaim(
      {
        politicianName: claim.politician.name,
        quote: claim.quote,
        topic: claim.topic,
      },
      { claimDate: claim.date },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[recheck] fact-check failed:", message);
    return NextResponse.json(
      { error: `הבדיקה החוזרת נכשלה: ${message}` },
      { status: 500 },
    );
  }

  const wasPublic = claim.editorApproved && claim.status === "published";
  const confident = isConfidentlyVerified(result);
  let outcome: "corrected" | "confirmed" | "withheld";
  let correctionNote: string | null = null;

  if (confident) {
    const verdictChanged = result.verdict !== claim.verdict;
    outcome = verdictChanged ? "corrected" : "confirmed";
    // Only a publicly-visible verdict flip is a reader-facing correction
    // worth logging on /corrections.
    if (wasPublic && verdictChanged) {
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
  } else {
    outcome = "withheld";
    await prisma.claim.update({
      where: { id: claim.id },
      data: {
        status: "review",
        editorApproved: false,
        verifiedAt: new Date(),
        verifierNotes: "בדיקה חוזרת לא אימתה את הטענה. דרושה הכרעה אנושית.",
      },
    });
  }

  // If a user report triggered this re-check, it's now resolved either way:
  // the claim was corrected, confirmed, or withheld for review.
  if (reportId) {
    await prisma.report.delete({ where: { id: reportId } }).catch(() => {});
  }

  revalidatePath("/admin/reports");
  revalidatePath("/admin/review");
  revalidatePath("/admin/claims");
  revalidatePath("/admin/status");
  revalidatePath(`/claim/${claim.id}`);
  revalidatePath("/");
  if (correctionNote) revalidatePath("/corrections");

  return NextResponse.json({
    ok: true,
    outcome,
    verdict: result.verdict,
    confidence: result.confidence,
    changed: outcome === "corrected",
  });
}
