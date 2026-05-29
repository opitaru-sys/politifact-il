/**
 * POST /api/admin/recheck
 *
 * Runs a REAL grounded fact-check (Google Search) on a single claim — now WITH
 * the source article as context — and acts on the result. This is the "actually
 * check it" path that the LITE report recommendation can't do (that one only
 * rewords without searching, which is how the "Operation Roaring Lion" miss
 * slipped through).
 *
 * The decision logic lives in src/lib/recheck.ts (shared with the bulk review
 * drain). Pass reportId to also resolve the originating report.
 *
 * Auth: cookie-based admin session, same as the rest of /api/admin/*.
 */
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";
import { recheckClaimById } from "@/lib/recheck";

// One grounded fact-check takes ~20-30s. Without this the route would run on
// Vercel's short default timeout and get killed mid-check.
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

  let result;
  try {
    result = await recheckClaimById(claimId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Claim not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    console.error("[recheck] failed:", message);
    return NextResponse.json(
      { error: `הבדיקה החוזרת נכשלה: ${message}` },
      { status: 500 },
    );
  }

  // If a user report triggered this re-check, it's resolved either way:
  // corrected, confirmed, or withheld for review.
  if (reportId) {
    await prisma.report.delete({ where: { id: reportId } }).catch(() => {});
  }

  revalidatePath("/admin/reports");
  revalidatePath("/admin/review");
  revalidatePath("/admin/claims");
  revalidatePath("/admin/status");
  revalidatePath("/corrections");
  revalidatePath(`/claim/${claimId}`);
  revalidatePath("/");

  return NextResponse.json({
    ok: true,
    outcome: result.outcome,
    verdict: result.verdict,
    confidence: result.confidence,
    changed: result.changed,
  });
}
