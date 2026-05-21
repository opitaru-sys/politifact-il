"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

/**
 * Server actions for admin claim management.
 *
 * Auth: every action takes the admin secret as a `key` form field and
 * compares to ADMIN_SECRET. Without a session system, this is the
 * simplest correct gate.
 */

function assertAdmin(formData: FormData): void {
  const key = formData.get("key");
  const secret = process.env.ADMIN_SECRET;
  if (!secret) throw new Error("ADMIN_SECRET not configured");
  if (typeof key !== "string" || key !== secret) throw new Error("Unauthorized");
}

/**
 * Update a claim's editable fields. Only changes fields that are present
 * in the FormData — undefined fields are left alone.
 */
export async function updateClaim(formData: FormData): Promise<void> {
  assertAdmin(formData);

  const id = formData.get("id");
  if (typeof id !== "string" || !id) throw new Error("Missing claim id");

  const verdict = formData.get("verdict");
  const status = formData.get("status");
  const editorApproved = formData.get("editorApproved");
  const summary = formData.get("summary");
  const explanation = formData.get("explanation");

  const data: {
    verdict?: string;
    status?: string;
    editorApproved?: boolean;
    summary?: string;
    explanation?: string;
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

  if (Object.keys(data).length === 0) return;

  await prisma.claim.update({ where: { id }, data });

  // Bust the list cache + the affected claim/politician pages.
  revalidatePath("/admin/claims");
  revalidatePath(`/claim/${id}`);
  revalidatePath("/");
}

/**
 * Permanently delete a claim. Cascades to comments / reports via Prisma's
 * relation handling (or via separate calls if cascade isn't on).
 */
export async function deleteClaim(formData: FormData): Promise<void> {
  assertAdmin(formData);

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
  assertAdmin(formData);

  const id = formData.get("id");
  if (typeof id !== "string" || !id) throw new Error("Missing report id");

  await prisma.report.delete({ where: { id } });
  revalidatePath("/admin/reports");
  revalidatePath("/admin/status");
}
