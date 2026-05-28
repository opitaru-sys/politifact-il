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
 * Default behavior: process up to 8 fresh-lane (RSS + Telegram) articles
 * per click. Pass ?mode=knesset to drain the Knesset backlog instead
 * (8 per click, ungrounded). Small batch sizes are intentional: each
 * article takes 5–30s, and we need every drain to finish well inside the
 * Vercel function timeout. The admin clicks the button again to keep
 * draining.
 *
 * Cost: each fresh-lane article ~$0.05 (grounded fact-check); each
 * Knesset article ~$0.006 (ungrounded). Don't expose this to non-admins.
 *
 * Diagnostics: the response includes `queueBefore` / `queueAfter` for
 * this lane so the admin can tell the difference between "0 claims
 * extracted but the queue drained" (normal — procedural plenum lines
 * mark processed=true and return []) and "0 claims extracted AND the
 * queue didn't move" (extractClaims is silently throwing — usually
 * Gemini quota exhausted, since extractClaims swallows all errors and
 * returns []).
 */
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

// Vercel function timeout. Drains are intentionally small batches but
// each grounded fact-check can take 20s, so we ask for the longest
// allowed runtime to give the batch breathing room. Pro plan ceiling.
export const maxDuration = 300;

// Knesset source string as stored in the Article table. Matches the
// constant in src/lib/fact-check.ts; duplicated here so this route
// doesn't need to import the heavy fact-check module just to count.
const KNESSET_SOURCE = "כנסת · מליאה";

// Per-click batch sizes. Tuned to finish comfortably inside maxDuration
// even on the slowest articles. Admin clicks again to keep draining.
const FRESH_BATCH = 8;
const KNESSET_BATCH = 8;

async function countQueue(lane: "fresh" | "knesset"): Promise<number> {
  if (lane === "knesset") {
    return prisma.article.count({
      where: { processed: false, source: KNESSET_SOURCE },
    });
  }
  return prisma.article.count({
    where: { processed: false, source: { not: KNESSET_SOURCE } },
  });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") ?? "fresh";
  const lane: "fresh" | "knesset" = mode === "knesset" ? "knesset" : "fresh";

  // Lazy-import the fact-check module so we don't pull it into the
  // module graph of pages that never trigger a drain.
  const { processFreshNewsArticles, processKnessetBacklog } = await import(
    "@/lib/fact-check"
  );

  const queueBefore = await countQueue(lane);

  try {
    let claims: { id: string }[] = [];
    if (lane === "knesset") {
      // Knesset runs ungrounded by convention. Mirror daily.mts.
      const prev = process.env.BADAK_DISABLE_GROUNDING;
      process.env.BADAK_DISABLE_GROUNDING = "1";
      try {
        claims = await processKnessetBacklog(KNESSET_BATCH);
      } finally {
        if (prev === undefined) delete process.env.BADAK_DISABLE_GROUNDING;
        else process.env.BADAK_DISABLE_GROUNDING = prev;
      }
    } else {
      claims = await processFreshNewsArticles(FRESH_BATCH, 48);
    }

    const queueAfter = await countQueue(lane);
    const drained = queueBefore - queueAfter;

    // If the queue didn't move at all, something is silently failing.
    // extractClaims swallows all errors and returns [], so the only way
    // articles stay processed=false after a drain attempt is if
    // processArticle threw before reaching its `processed: true` update —
    // most often a quota outage or a body-fetch crash.
    const stuckWarning =
      drained === 0 && queueBefore > 0
        ? "התור לא ירד למרות שניסיתי לעבד כתבות. בדוק את הלוגים — לרוב זה מגביל מכסה של Gemini או שגיאה ב-fetch של גוף הכתבה."
        : null;

    return NextResponse.json({
      mode: lane,
      processed: claims.length,
      queueBefore,
      queueAfter,
      drained,
      stuckWarning,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[drain] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
