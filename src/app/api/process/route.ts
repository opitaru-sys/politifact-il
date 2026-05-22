import { NextResponse } from "next/server";
import {
  processFreshNewsArticles,
  processKnessetBacklog,
  processUnprocessedArticles,
} from "@/lib/fact-check";

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
