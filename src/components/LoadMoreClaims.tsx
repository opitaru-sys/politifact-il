"use client";

import { useState } from "react";
import type { SerializedClaim } from "@/lib/data";
import { ClaimCard } from "./ClaimCard";
import { BenGurionSpinner } from "./BenGurionSpinner";

interface Props {
  /** Pagination state at first paint — server already rendered claims
   *  0 through `initialOffset - 1`, so the first "load more" click
   *  should request offset = initialOffset. */
  initialOffset: number;
  /** Per-page size. Same value the server used for the initial render
   *  so the rhythm of clicks feels even. */
  pageSize: number;
  /** Total matching the window+filters. Used to (a) decide when to
   *  hide the button and (b) render an honest "N / total" hint so
   *  visitors know how much is left. */
  total: number;
  /** Active window in days (1/7/30/60/90). Forwarded to /api/claims. */
  windowDays: number;
  /** URL filters, forwarded so the API returns the same slice. */
  topic: string | null;
  politicianId: string | null;
}

/**
 * "טען עוד" button that fetches the next page of claims from
 * `/api/claims` and appends them client-side. Kept in a separate
 * client component so the initial server render stays small —
 * only the button itself (not the entire feed) needs the client
 * runtime.
 *
 * Pattern choice: client-side fetch + `ClaimCard` render
 * (Plan C1 from the planning doc). Rejected RSC server actions
 * because `ClaimCard` is already a client component, so passing
 * JSON-serialized claims and rendering them in client land is the
 * simpler path with no markup duplication.
 */
export function LoadMoreClaims({ initialOffset, pageSize, total, windowDays, topic, politicianId }: Props) {
  const [loaded, setLoaded] = useState<SerializedClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Server already rendered `initialOffset` claims; everything in
  // `loaded` is what this client component has fetched since.
  // The next API request starts at `initialOffset + loaded.length`.
  const shown = initialOffset + loaded.length;
  const hasMore = shown < total;

  async function loadMore() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        window: String(windowDays),
        offset: String(shown),
        limit: String(pageSize),
      });
      if (topic) params.set("topic", topic);
      if (politicianId) params.set("politician", politicianId);
      const res = await fetch(`/api/claims?${params.toString()}`, {
        // No need to cache — pagination response is request-specific
        // and the underlying data may have changed between clicks.
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { claims: SerializedClaim[] } = await res.json();
      setLoaded((prev) => [...prev, ...data.claims]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בטעינת טענות נוספות");
    } finally {
      setLoading(false);
    }
  }

  if (!hasMore && loaded.length === 0) return null;

  return (
    <>
      {loaded.length > 0 && (
        <div className="space-y-4 mt-4">
          {loaded.map((claim) => (
            <div key={claim.id} className="card-in">
              <ClaimCard claim={claim} />
            </div>
          ))}
        </div>
      )}
      {hasMore && (
        <div className="mt-6 flex items-center justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="inline-flex items-center gap-2 border border-border-strong bg-card px-5 py-2.5 text-sm font-bold hover:bg-background-alt transition-colors disabled:opacity-60 disabled:cursor-wait"
            style={{ borderRadius: 2 }}
          >
            {loading ? (
              <>
                <BenGurionSpinner size={24} />
                <span>טוען...</span>
              </>
            ) : (
              <span>
                טען עוד <span className="text-foreground-muted tabular-nums font-medium">({total - shown})</span>
              </span>
            )}
          </button>
        </div>
      )}
      {error && (
        <div className="mt-3 text-center text-xs text-accent">{error}</div>
      )}
    </>
  );
}
