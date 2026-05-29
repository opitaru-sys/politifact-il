import { NextResponse } from "next/server";
import {
  processFreshNewsArticles,
  processKnessetBacklog,
  processUnprocessedArticles,
} from "@/lib/fact-check";

// A fresh run processes up to 60 articles in chunks of 8; each grounded
// fact-check takes ~20-25s, so a full batch needs ~200s of runtime. Without
// this, the route ran on Vercel's short default timeout and got killed
// mid-batch — the un-reached articles stayed processed=false and sat in the
// queue until a later tick. 300s (Pro ceiling) lets a batch fully drain.
export const maxDuration = 300;

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") ?? "fresh";
  const limit = Number(searchParams.get("limit") ?? "");
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : undefined;

  const results =
    mode === "all"
      ? await processUnprocessedArticles(safeLimit ?? 50)
      : mode === "rss-backlog"
      ? await processUnprocessedArticles({
          limit: safeLimit ?? 20,
          excludeSources: ["כנסת · מליאה"],
          order: "oldest",
        })
      : mode === "knesset"
      ? await processKnessetBacklog(safeLimit ?? 5)
      : await processFreshNewsArticles(safeLimit ?? 80);

  return NextResponse.json({
    mode,
    processed: results.length,
    claims: results.map((c) => ({
      id: c.id,
      quote: c.quote,
      verdict: c.verdict,
      status: c.status,
    })),
  });
}
