/**
 * Editorial loading state.
 *
 * No rounded SaaS skeletons. Hairline rules, muted card boxes, no animation
 * other than a subtle opacity pulse on the headline. Visually matches the
 * same Civic Press palette the rest of the site uses (cream paper +
 * hairline borders), so the page never flashes "white SaaS" while data
 * lands.
 */
export default function Loading() {
  return (
    <div className="space-y-8">
      {/* Eyebrow + headline placeholder */}
      <section>
        <div className="h-3 w-32 bg-muted mb-3" style={{ borderRadius: 2 }} />
        <div className="h-9 w-3/4 bg-muted mb-2 animate-pulse" style={{ borderRadius: 2 }} />
        <div className="h-4 w-1/2 bg-muted" style={{ borderRadius: 2 }} />
      </section>

      {/* Hero row — primary card on the right, leaderboard preview on the left */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          className="bg-card border border-border-strong p-5 h-80"
          style={{ borderRadius: 4 }}
        >
          <div className="h-3 w-24 bg-muted mb-4" style={{ borderRadius: 2 }} />
          <div className="h-12 w-40 bg-muted mb-2" style={{ borderRadius: 2 }} />
          <div className="h-3 w-3/4 bg-muted mb-6" style={{ borderRadius: 2 }} />
          <div className="rule mb-4" />
          <div className="space-y-2">
            <div className="h-3 w-full bg-muted" style={{ borderRadius: 2 }} />
            <div className="h-3 w-5/6 bg-muted" style={{ borderRadius: 2 }} />
          </div>
        </div>
        <div
          className="bg-card border border-border-strong h-80"
          style={{ borderRadius: 4 }}
        >
          <div className="px-5 py-3.5 border-b border-border">
            <div className="h-4 w-28 bg-muted" style={{ borderRadius: 2 }} />
          </div>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3 border-b border-border last:border-b-0">
              <div className="h-3 w-5 bg-muted" style={{ borderRadius: 2 }} />
              <div className="w-8 h-8 rounded-full bg-muted shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-3/4 bg-muted" style={{ borderRadius: 2 }} />
                <div className="h-2.5 w-1/2 bg-muted/70" style={{ borderRadius: 2 }} />
              </div>
              <div className="h-5 w-10 bg-muted" style={{ borderRadius: 2 }} />
            </div>
          ))}
        </div>
      </div>

      {/* Filter row placeholder */}
      <div
        className="bg-card border border-border h-14"
        style={{ borderRadius: 4 }}
      />

      {/* Claim cards */}
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-card border border-border p-5 space-y-3"
            style={{ borderRadius: 4 }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-muted" />
                <div className="space-y-1.5">
                  <div className="h-3 w-32 bg-muted" style={{ borderRadius: 2 }} />
                  <div className="h-2.5 w-20 bg-muted/70" style={{ borderRadius: 2 }} />
                </div>
              </div>
              <div className="h-6 w-16 bg-muted" style={{ borderRadius: 2 }} />
            </div>
            <div className="space-y-1.5 pr-4 border-r-[3px] border-border">
              <div className="h-4 w-full bg-muted" style={{ borderRadius: 2 }} />
              <div className="h-4 w-5/6 bg-muted" style={{ borderRadius: 2 }} />
            </div>
            <div className="space-y-1.5">
              <div className="h-3 w-full bg-muted/70" style={{ borderRadius: 2 }} />
              <div className="h-3 w-3/4 bg-muted/70" style={{ borderRadius: 2 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
