import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const recentReports = new Map<string, number[]>();

function isRateLimited(ip: string, maxPerMinute: number = 3): boolean {
  const now = Date.now();
  const timestamps = recentReports.get(ip) ?? [];
  const recent = timestamps.filter((t) => now - t < 60_000);
  if (recent.length >= maxPerMinute) return true;
  recent.push(now);
  recentReports.set(ip, recent);
  return false;
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

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
