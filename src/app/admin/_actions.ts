"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertAdmin } from "@/lib/admin-auth";

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
  revalidatePath(`/claim/${id}`);
  revalidatePath("/");
  if (correctionNote) revalidatePath("/corrections");
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
