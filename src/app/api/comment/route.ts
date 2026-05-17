import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/comment?claimId=... → list of comments for a claim (most recent first)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const claimId = searchParams.get("claimId");
  if (!claimId) {
    return NextResponse.json({ error: "claimId required" }, { status: 400 });
  }
  const comments = await prisma.comment.findMany({
    where: { claimId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ comments });
}

// POST /api/comment → { claimId, author, body }
export async function POST(request: Request) {
  try {
    const { claimId, author, body } = await request.json();
    if (!claimId || !body) {
      return NextResponse.json({ error: "claimId and body required" }, { status: 400 });
    }
    const trimmedAuthor = (author || "").toString().trim().slice(0, 60) || "אנונימי";
    const trimmedBody = body.toString().trim().slice(0, 1000);
    if (trimmedBody.length < 2) {
      return NextResponse.json({ error: "comment too short" }, { status: 400 });
    }

    const claim = await prisma.claim.findUnique({ where: { id: claimId } });
    if (!claim) {
      return NextResponse.json({ error: "claim not found" }, { status: 404 });
    }

    const comment = await prisma.comment.create({
      data: {
        id: `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        claimId,
        author: trimmedAuthor,
        body: trimmedBody,
      },
    });

    return NextResponse.json({ success: true, comment });
  } catch (error) {
    console.error("Comment error:", error);
    return NextResponse.json({ error: "Failed to post comment" }, { status: 500 });
  }
}
