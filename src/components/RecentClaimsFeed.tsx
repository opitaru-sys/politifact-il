import Link from "next/link";
import { getRecentClaims, getRecentClaimsCount } from "@/lib/data";
import { ClaimCard } from "./ClaimCard";
import { LoadMoreClaims } from "./LoadMoreClaims";
import { windowLabel } from "@/lib/window";

/** Initial page size — server-rendered into HTML, immediately visible
 *  and crawlable. Subsequent pages load via /api/claims on demand.
 *  30 was picked as the smallest size that fills a typical desktop
 *  viewport above the fold and a few scrolls deep on mobile. */
export const INITIAL_FEED_LIMIT = 30;

interface Props {
  activeDays: number;
  activeTopic: string | null;
  activePolitician: string | null;
  /** Active window value (1/7/30/60/90) for the header label. */
  windowValue: string;
  /** True if any URL filter (topic / politician / non-default window)
   *  is active — used to render the "clear filters" link in the empty
   *  state. */
  hasFilter: boolean;
}

/**
 * Async server component that owns the recent-claims feed. Wrapped in
 * a `<Suspense>` boundary in `page.tsx` so the stats header (hero +
 * leaderboard + window selector) can paint immediately while this
 * heavier query streams in.
 *
 * Why this split: changing `?window=` re-renders the entire page
 * route. Before the split, the user saw the previous page fully until
 * the slowest query (`getRecentClaims` over a 90-day window) finished
 * — felt unresponsive. Now only this section is replaced by
 * `FeedSkeleton` during the transition.
 *
 * Pagination: fetches `INITIAL_FEED_LIMIT + 1` rows (a count alone
 * would need a second round-trip; a small over-fetch tells us
 * "is there a next page?" cheaply). The total count for the header
 * is fetched in parallel so visitors see "X טענות" honestly even
 * though only 30 are rendered initially.
 */
export async function RecentClaimsFeed({
  activeDays,
  activeTopic,
  activePolitician,
  windowValue,
  hasFilter,
}: Props) {
  // Push topic / politician filters into the DB query so pagination
  // is correct. Previously the parent fetched everything and filtered
  // in memory — fine for unlimited results, broken for `take`/`skip`.
  console.time("RecentClaimsFeed.parallel-queries");
  const [initialClaims, total] = await Promise.all([
    (async () => {
      console.time("RecentClaimsFeed.getRecentClaims");
      const c = await getRecentClaims(activeDays, {
        limit: INITIAL_FEED_LIMIT,
        offset: 0,
        topic: activeTopic,
        politicianId: activePolitician,
      });
      console.timeEnd("RecentClaimsFeed.getRecentClaims");
      return c;
    })(),
    (async () => {
      console.time("RecentClaimsFeed.getRecentClaimsCount");
      const n = await getRecentClaimsCount(activeDays, {
        topic: activeTopic,
        politicianId: activePolitician,
      });
      console.timeEnd("RecentClaimsFeed.getRecentClaimsCount");
      return n;
    })(),
  ]);
  console.timeEnd("RecentClaimsFeed.parallel-queries");

  if (total === 0) {
    return (
      <>
        <div className="text-[11px] tracking-wider uppercase text-foreground-muted tabular-nums text-left mb-3">
          0 טענות · {windowLabel(windowValue)}
        </div>
        <div
          className="bg-card border border-border p-8 mt-2 text-center text-foreground-muted text-sm"
          style={{ borderRadius: 4 }}
        >
          לא נמצאו טענות התואמות את הסינון {windowLabel(windowValue)}.
          {hasFilter && (
            <div className="mt-3">
              <Link href="/" className="text-accent hover:text-accent-dark font-bold underline">
                ← נקה סינון
              </Link>
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="text-[11px] tracking-wider uppercase text-foreground-muted tabular-nums text-left mb-3">
        {total} טענות · {windowLabel(windowValue)}
      </div>
      <div className="space-y-4">
        {initialClaims.map((claim, i) => (
          <div key={claim.id} className="card-in" style={{ animationDelay: `${i * 40}ms` }}>
            <ClaimCard claim={claim} />
          </div>
        ))}
      </div>
      <LoadMoreClaims
        initialOffset={initialClaims.length}
        pageSize={INITIAL_FEED_LIMIT}
        total={total}
        windowDays={activeDays}
        topic={activeTopic}
        politicianId={activePolitician}
      />
    </>
  );
}
