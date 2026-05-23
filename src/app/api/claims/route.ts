import { NextResponse } from "next/server";
import { getRecentClaims } from "@/lib/data";
import { resolveWindow } from "@/lib/window";

/** Hard ceiling on per-request page size to keep API responses
 *  bounded — visitors paginating through hundreds of claims still
 *  hit /api/claims many times, which is fine; a single 500-row
 *  response is not. Matches `INITIAL_FEED_LIMIT` in the feed
 *  component so the per-click cost is even. */
const MAX_LIMIT = 30;
const DEFAULT_LIMIT = 30;

/**
 * Paginated feed for the "טען עוד" button in `LoadMoreClaims`.
 *
 * Returns JSON in the shape `{ claims: SerializedClaim[] }`. The
 * shape mirrors what `data.ts/getRecentClaims` returns so the
 * client component can pass the items straight to `<ClaimCard>`
 * with no further normalization.
 *
 * Query params:
 *   - window: 1 | 7 | 30 | 60 | 90 (days)         — required
 *   - offset: number ≥ 0                          — default 0
 *   - limit:  number 1..MAX_LIMIT                 — default 30
 *   - topic:  string                              — optional
 *   - politician: politicianId string             — optional
 *
 * Auth: public — same filter set as `getRecentClaims` (only
 * status=published + editorApproved=true claims are returned).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const windowParam = url.searchParams.get("window") ?? "30";
  const offsetRaw = url.searchParams.get("offset");
  const limitRaw = url.searchParams.get("limit");
  const topic = url.searchParams.get("topic")?.trim() || null;
  const politicianId = url.searchParams.get("politician")?.trim() || null;

  const win = resolveWindow(windowParam);
  const offset = Math.max(0, parseInt(offsetRaw ?? "0", 10) || 0);
  const requestedLimit = parseInt(limitRaw ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT;
  const limit = Math.max(1, Math.min(MAX_LIMIT, requestedLimit));

  try {
    const claims = await getRecentClaims(win.days, {
      limit,
      offset,
      topic,
      politicianId,
    });
    return NextResponse.json({ claims });
  } catch (err) {
    console.error("/api/claims GET failed", err);
    return NextResponse.json(
      { error: "Failed to load claims" },
      { status: 500 },
    );
  }
}
