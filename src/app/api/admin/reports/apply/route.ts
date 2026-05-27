/**
 * POST /api/admin/reports/apply
 *
 * Applies an AI-recommended action to a report's underlying claim, then
 * deletes the report. Called from /admin/reports via a small client-side
 * <form onSubmit> handler in ApplyRecommendationButton.
 *
 * Used to be a server action (applyReportRecommendation in _actions.ts),
 * but server actions ran into a Next 16 issue where the form would
 * silently fail to submit when a hidden input collided with the form's
 * `action` prop. A plain route handler avoids the whole problem.
 *
 * Auth: same cookie-based session as the admin pages.
 */
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    reportId?: string;
    claimId?: string;
    action?: string;
    newVerdict?: string;
    newExplanation?: string;
    correctionNote?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const reportId = typeof body.reportId === "string" ? body.reportId : "";
  const claimId = typeof body.claimId === "string" ? body.claimId : "";
  const action = typeof body.action === "string" ? body.action : "";
  const correctionNote =
    typeof body.correctionNote === "string" ? body.correctionNote.trim() : "";

  if (!reportId) return NextResponse.json({ error: "Missing reportId" }, { status: 400 });
  if (!claimId) return NextResponse.json({ error: "Missing claimId" }, { status: 400 });

  try {
    if (action === "hide") {
      if (!correctionNote) {
        return NextResponse.json({ error: "Hide requires correctionNote" }, { status: 400 });
      }
      await prisma.claim.update({
        where: { id: claimId },
        data: { editorApproved: false, correctionNote, correctedAt: new Date() },
      });
    } else if (action === "change_verdict") {
      const newVerdict = body.newVerdict;
      if (
        typeof newVerdict !== "string" ||
        !["true", "half-true", "false"].includes(newVerdict)
      ) {
        return NextResponse.json({ error: "change_verdict requires valid newVerdict" }, { status: 400 });
      }
      if (!correctionNote) {
        return NextResponse.json({ error: "Verdict change requires correctionNote" }, { status: 400 });
      }
      await prisma.claim.update({
        where: { id: claimId },
        data: { verdict: newVerdict, correctionNote, correctedAt: new Date() },
      });
    } else if (action === "edit_explanation") {
      const newExplanation = body.newExplanation;
      if (typeof newExplanation !== "string" || !newExplanation.trim()) {
        return NextResponse.json({ error: "edit_explanation requires newExplanation" }, { status: 400 });
      }
      if (!correctionNote) {
        return NextResponse.json({ error: "Explanation edit requires correctionNote" }, { status: 400 });
      }
      await prisma.claim.update({
        where: { id: claimId },
        data: { explanation: newExplanation.trim(), correctionNote, correctedAt: new Date() },
      });
    } else if (action === "dismiss") {
      // No claim change.
    } else {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    await prisma.report.delete({ where: { id: reportId } });

    revalidatePath("/admin/reports");
    revalidatePath("/admin/status");
    revalidatePath(`/claim/${claimId}`);
    revalidatePath("/corrections");
    revalidatePath("/");

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[apply-recommendation] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
