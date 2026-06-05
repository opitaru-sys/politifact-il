"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertAdmin } from "@/lib/admin-auth";
import { LOW_CONFIDENCE_REVIEW_THRESHOLD } from "@/lib/review-config";

/**
 * Server actions for admin claim management.
 *
 * Auth: cookie-based, via assertAdmin() from src/lib/admin-auth.ts.
 * The cookie is set on /admin/login and travels with the form
 * submission automatically. No more `?key=` in URLs or hidden form
 * inputs — see 2026-05-26 security audit (HIGH).
 */

/**
 * Update a claim's editable fields. Only changes fields that are present
 * in the FormData — undefined fields are left alone.
 *
 * Correction-logging rule: if a previously-public claim is being amended
 * or hidden (status -> rejected, editorApproved true -> false, or any
 * summary/explanation/verdict edit), the editor MUST supply a
 * `correctionNote` and we record it on the row so `/corrections` picks
 * it up. Re-approving (false -> true) does NOT require a note — it's
 * restoration, not a correction. If the note is supplied on any update,
 * we write it; the date is also stamped.
 */
export async function updateClaim(formData: FormData): Promise<void> {
  await assertAdmin();

  const id = formData.get("id");
  if (typeof id !== "string" || !id) throw new Error("Missing claim id");

  const verdict = formData.get("verdict");
  const status = formData.get("status");
  const editorApproved = formData.get("editorApproved");
  const summary = formData.get("summary");
  const explanation = formData.get("explanation");
  const correctionNoteRaw = formData.get("correctionNote");
  const correctionNote =
    typeof correctionNoteRaw === "string" ? correctionNoteRaw.trim() : "";

  const data: {
    verdict?: string;
    status?: string;
    editorApproved?: boolean;
    summary?: string;
    explanation?: string;
    correctionNote?: string;
    correctedAt?: Date;
  } = {};

  if (typeof verdict === "string" && ["true", "half-true", "false"].includes(verdict)) {
    data.verdict = verdict;
  }
  if (typeof status === "string" && ["published", "draft", "review", "rejected"].includes(status)) {
    data.status = status;
  }
  // editorApproved comes as "true" / "false" / "null" string.
  if (typeof editorApproved === "string") {
    if (editorApproved === "true") data.editorApproved = true;
    else if (editorApproved === "false") data.editorApproved = false;
  }
  if (typeof summary === "string" && summary.trim().length > 0) {
    data.summary = summary.trim();
  }
  if (typeof explanation === "string" && explanation.trim().length > 0) {
    data.explanation = explanation.trim();
  }

  if (Object.keys(data).length === 0 && !correctionNote) return;

  // Detect whether this edit is a "correction" — modifies a previously-
  // public claim in a way readers care about. We need the existing row
  // to compare.
  const existing = await prisma.claim.findUnique({
    where: { id },
    select: {
      editorApproved: true,
      status: true,
      verdict: true,
      summary: true,
      explanation: true,
    },
  });
  if (!existing) throw new Error("Claim not found");

  const wasPublic = existing.editorApproved && existing.status === "published";
  const willHide =
    (data.editorApproved === false && existing.editorApproved) ||
    (data.status === "rejected" && existing.status !== "rejected");
  const contentChanged =
    (data.verdict !== undefined && data.verdict !== existing.verdict) ||
    (data.summary !== undefined && data.summary !== existing.summary) ||
    (data.explanation !== undefined && data.explanation !== existing.explanation);
  const isCorrection = wasPublic && (willHide || contentChanged);

  if (isCorrection && !correctionNote) {
    throw new Error(
      "Correction note required: this edit changes a publicly-visible claim. " +
        "Provide a `correctionNote` so it appears on /corrections.",
    );
  }

  if (correctionNote) {
    data.correctionNote = correctionNote;
    data.correctedAt = new Date();
  }

  await prisma.claim.update({ where: { id }, data });

  // Bust the list cache + the affected claim/politician pages.
  revalidatePath("/admin/claims");
  revalidatePath("/admin/review");
  revalidatePath(`/claim/${id}`);
  revalidatePath("/");
  if (correctionNote) revalidatePath("/corrections");
}

/**
 * Record + apply an editor's decision on a withheld claim in /admin/review.
 *   dismiss -> status="rejected" (drops from the queue, hidden from public)
 *   publish -> status="published", editorApproved=true (goes live as-is)
 * Either way we stamp humanDecision/humanDecisionAt so the rule-suggestion
 * miner (scripts/suggest-rules.mts) has a clean labeled set of what the editor
 * approves vs rejects — the basis for proposing new deterministic filter rules.
 *
 * Field is named "decision" (not "action") on purpose: a hidden input named
 * "action" collides with the <form action={...}> prop under Next 16 and the
 * submit silently fails (see the reports-page note).
 */
export async function decideReviewClaim(formData: FormData): Promise<void> {
  await assertAdmin();

  const id = formData.get("id");
  const decision = formData.get("decision");
  if (typeof id !== "string" || !id) throw new Error("Missing claim id");
  if (decision !== "dismiss" && decision !== "publish") {
    throw new Error("Invalid decision");
  }

  await prisma.claim.update({
    where: { id },
    data:
      decision === "publish"
        ? {
            status: "published",
            editorApproved: true,
            humanDecision: "publish",
            humanDecisionAt: new Date(),
          }
        : {
            status: "rejected",
            editorApproved: false,
            humanDecision: "dismiss",
            humanDecisionAt: new Date(),
          },
  });

  revalidatePath("/admin/review");
  revalidatePath("/admin/claims");
  revalidatePath("/admin/status");
  revalidatePath(`/claim/${id}`);
  revalidatePath("/");
}

/**
 * Bulk-dismiss every withheld claim (status="review") whose AI confidence
 * is at or below LOW_CONFIDENCE_REVIEW_THRESHOLD (0.30). These are the
 * "the automatic check basically gave up" claims — dominated by
 * quota-exhaustion withholds and genuinely unverifiable statements — and
 * they almost never get published after a human looks. The review queue
 * fills up with them, so this clears the low-value tail in one click.
 *
 * Sets status="rejected" + humanDecision="dismiss" (same end state as the
 * per-claim "דחה" button) so the rule-suggestion miner still sees a clean
 * labeled "editor rejected this" signal. No correctionNote is written:
 * these were status="review", never publicly visible, so there's nothing
 * to log on /corrections.
 *
 * The threshold is hardcoded server-side (not read from the form) so a
 * tampered request can't widen the net and dismiss high-confidence claims.
 *
 * Reversible: each row is still in the DB; the full editor (/admin/claims)
 * can flip status back if a dismiss was wrong.
 */
export async function bulkDismissLowConfidenceReview(): Promise<void> {
  await assertAdmin();

  await prisma.claim.updateMany({
    where: {
      status: "review",
      confidence: { lte: LOW_CONFIDENCE_REVIEW_THRESHOLD },
    },
    data: {
      status: "rejected",
      editorApproved: false,
      humanDecision: "dismiss",
      humanDecisionAt: new Date(),
    },
  });

  revalidatePath("/admin/review");
  revalidatePath("/admin/claims");
  revalidatePath("/admin/status");
  revalidatePath("/");
}

/**
 * Permanently delete a claim. Cascades to comments / reports via Prisma's
 * relation handling (or via separate calls if cascade isn't on).
 */
export async function deleteClaim(formData: FormData): Promise<void> {
  await assertAdmin();

  const id = formData.get("id");
  if (typeof id !== "string" || !id) throw new Error("Missing claim id");

  // Comments and Reports don't have ON DELETE CASCADE in the schema, so
  // remove them first to avoid a foreign-key error.
  await prisma.comment.deleteMany({ where: { claimId: id } });
  await prisma.report.deleteMany({ where: { claimId: id } });
  await prisma.claim.delete({ where: { id } });

  revalidatePath("/admin/claims");
  revalidatePath("/");
}

/**
 * Dismiss a user-submitted report. Deletes the Report row entirely —
 * the underlying claim is untouched. Used in /admin/reports as the
 * "I've looked at this, no action needed" action so the report doesn't
 * keep appearing in the queue.
 */
export async function dismissReport(formData: FormData): Promise<void> {
  await assertAdmin();

  const id = formData.get("id");
  if (typeof id !== "string" || !id) throw new Error("Missing report id");

  await prisma.report.delete({ where: { id } });
  revalidatePath("/admin/reports");
  revalidatePath("/admin/status");
}

// Applying a report's AI recommendation lives at POST
// /api/admin/reports/apply (src/app/api/admin/reports/apply/route.ts).
// It used to be a server action here but server actions wouldn't
// reliably submit on the reports page, likely a Next 16 edge case
// when a hidden `name="action"` input collided with the form's
// own `action={...}` prop. A plain route handler dodges the issue.

/**
 * Permanently delete a comment. Admin-only. Used from /admin/comments
 * to remove spam, abuse, or off-topic noise. The underlying claim is
 * untouched.
 */
export async function deleteComment(formData: FormData): Promise<void> {
  await assertAdmin();

  const id = formData.get("id");
  if (typeof id !== "string" || !id) throw new Error("Missing comment id");

  // We need the claimId to revalidate the public claim page.
  const existing = await prisma.comment.findUnique({
    where: { id },
    select: { claimId: true },
  });

  await prisma.comment.delete({ where: { id } });

  revalidatePath("/admin/comments");
  if (existing?.claimId) revalidatePath(`/claim/${existing.claimId}`);
}
