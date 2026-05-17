import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const { claimId, reason, details } = await request.json();

    if (!claimId || !reason) {
      return NextResponse.json({ error: "Missing claimId or reason" }, { status: 400 });
    }

    const claim = await prisma.claim.findUnique({ where: { id: claimId } });
    if (!claim) {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }

    const report = await prisma.report.create({
      data: {
        claimId,
        reason,
        details: details || null,
        id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      },
    });

    return NextResponse.json({ success: true, id: report.id });
  } catch (error) {
    console.error("Report error:", error);
    return NextResponse.json({ error: "Failed to submit report" }, { status: 500 });
  }
}
