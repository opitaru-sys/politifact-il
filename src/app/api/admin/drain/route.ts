/**
 * POST /api/admin/drain
 *
 * Manually drain the article processing queue. Triggered by the admin
 * from /admin/status via DrainQueueButton, used when the queue has piled
 * up between cron ticks and the admin doesn't want to wait.
 *
 * Auth: cookie-based, same as the rest of /api/admin/*. The cookie path
 * widening (commit 8580353) is what makes this reachable.
 *
 * Default behavior: process up to 100 fresh-lane (RSS + Telegram)
 * articles. Pass ?mode=knesset to drain the Knesset backlog instead
 * (up to 30 per call, ungrounded). Pass ?mode=all to drain both lanes
 * sequentially.
 *
 * Cost: each fresh-lane article ~$0.05 (grounded fact-check); each
 * Knesset article ~$0.006 (ungrounded). 100 fresh articles ≈ $5 worst
 * case. Don't expose this to non-admins.
 */
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") ?? "fresh";

  // Lazy-import the fact-check module so we don't pull it into the
  // module graph of pages that never trigger a drain.
  const { processFreshNewsArticles, processKnessetBacklog } = await import(
    "@/lib/fact-check"
  );

  try {
    if (mode === "knesset") {
      // Knesset runs ungrounded by convention (BADAK_DISABLE_GROUNDING=1
      // is set inside processKnessetBacklog's call path in daily.mts;
      // mirror that here for cost parity).
      const prev = process.env.BADAK_DISABLE_GROUNDING;
      process.env.BADAK_DISABLE_GROUNDING = "1";
      try {
        const claims = await processKnessetBacklog(30);
        return NextResponse.json({
          mode: "knesset",
          processed: claims.length,
        });
      } finally {
        if (prev === undefined) delete process.env.BADAK_DISABLE_GROUNDING;
        else process.env.BADAK_DISABLE_GROUNDING = prev;
      }
    }

    if (mode === "all") {
      const fresh = await processFreshNewsArticles(100, 48);
      const prev = process.env.BADAK_DISABLE_GROUNDING;
      process.env.BADAK_DISABLE_GROUNDING = "1";
      let knesset;
      try {
        knesset = await processKnessetBacklog(30);
      } finally {
        if (prev === undefined) delete process.env.BADAK_DISABLE_GROUNDING;
        else process.env.BADAK_DISABLE_GROUNDING = prev;
      }
      return NextResponse.json({
        mode: "all",
        fresh: fresh.length,
        knesset: knesset.length,
        processed: fresh.length + knesset.length,
      });
    }

    // Default: fresh lane (RSS + Telegram), grounded.
    const claims = await processFreshNewsArticles(100, 48);
    return NextResponse.json({ mode: "fresh", processed: claims.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[drain] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
