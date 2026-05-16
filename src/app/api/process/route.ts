import { NextResponse } from "next/server";
import { processUnprocessedArticles } from "@/lib/fact-check";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await processUnprocessedArticles();
  return NextResponse.json({
    processed: results.length,
    claims: results.map((c) => ({
      id: c.id,
      quote: c.quote,
      verdict: c.verdict,
      status: c.status,
    })),
  });
}
