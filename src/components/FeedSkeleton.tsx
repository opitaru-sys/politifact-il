/**
 * Fallback for the `<Suspense>` boundary wrapping the recent-claims
 * feed. Renders five card-shaped placeholders that match the Civic
 * Press chrome of `ClaimCard`: cream background, hairline border,
 * 4px border-radius, padding parity. Subtle pulse on the title +
 * quote bars so it reads as "loading" without the SaaS-shimmer
 * gradient that would clash with the newsprint aesthetic.
 *
 * Used by `src/app/page.tsx` while `RecentClaimsFeed` is suspended
 * (i.e. while `getRecentClaims(window)` is running after the user
 * changes the `?window=` URL param).
 *
 * Pure server component — no client JS, no animation library;
 * Tailwind's `animate-pulse` is enough.
 */
export function FeedSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-4 mt-5" aria-busy="true" aria-live="polite">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-card border border-border p-5"
          style={{ borderRadius: 4 }}
        >
          {/* header row: avatar + name/date + verdict pill */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-border animate-pulse" />
              <div className="space-y-1.5">
                <div className="h-3 w-32 bg-border animate-pulse" style={{ borderRadius: 2 }} />
                <div className="h-2.5 w-24 bg-border/70 animate-pulse" style={{ borderRadius: 2 }} />
              </div>
            </div>
            <div className="h-6 w-16 bg-border animate-pulse" style={{ borderRadius: 2 }} />
          </div>

          {/* quote block — taller, accent-edge to match the real card */}
          <div className="pr-4 border-r-[3px] border-border space-y-2 mb-3">
            <div className="h-4 w-full bg-border animate-pulse" style={{ borderRadius: 2 }} />
            <div className="h-4 w-[88%] bg-border animate-pulse" style={{ borderRadius: 2 }} />
          </div>

          {/* TL;DR */}
          <div className="space-y-1.5">
            <div className="h-3 w-full bg-border/70 animate-pulse" style={{ borderRadius: 2 }} />
            <div className="h-3 w-[70%] bg-border/70 animate-pulse" style={{ borderRadius: 2 }} />
          </div>

          {/* footer row */}
          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-3">
            <div className="h-2.5 w-40 bg-border/60 animate-pulse" style={{ borderRadius: 2 }} />
            <div className="h-2.5 w-16 bg-border/60 animate-pulse" style={{ borderRadius: 2 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
