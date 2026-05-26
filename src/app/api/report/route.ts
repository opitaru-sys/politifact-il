import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const allowed = await checkRateLimit("report", request);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many reports. Please wait a minute." },
        { status: 429 },
      );
    }

    const { claimId, reason, details } = await request.json();

    if (!claimId || !reason) {
      return NextResponse.json({ error: "Missing claimId or reason" }, { status: 400 });
    }

    // Cap the user-submitted fields. Rate-limited to 3/min/IP, but
    // each report could still be megabytes without these caps.
    // Storage-abuse vector flagged in the 2026-05-26 audit (LOW).
    const trimmedReason = String(reason).trim().slice(0, 200);
    const trimmedDetails = details ? String(details).trim().slice(0, 1000) : null;
    if (trimmedReason.length < 2) {
      return NextResponse.json({ error: "reason too short" }, { status: 400 });
    }

    const claim = await prisma.claim.findUnique({ where: { id: claimId } });
    if (!claim) {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }

    const report = await prisma.report.create({
      data: {
        claimId,
        reason: trimmedReason,
        details: trimmedDetails,
        id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      },
    });

    return NextResponse.json({ success: true, id: report.id });
  } catch (error) {
    console.error("Report error:", error);
    return NextResponse.json({ error: "Failed to submit report" }, { status: 500 });
  }
}
