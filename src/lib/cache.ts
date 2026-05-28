import { unstable_cache } from "next/cache";

/**
 * Wrapper around Next's `unstable_cache` that is SAFE to call outside the
 * Next.js runtime.
 *
 * Inside a request/render, results are persisted in the Data Cache exactly
 * like `unstable_cache`. In a standalone process — the `tsx` pipeline and
 * cron scripts in `scripts/` — Next's incremental cache isn't initialized,
 * and `unstable_cache` throws an "incrementalCache missing" invariant
 * (code E469; see node_modules/next/dist/server/web/spec-extension/
 * unstable-cache.js, line ~60). Several of those scripts reach these query
 * functions (e.g. generate-topic-insights.mts → synthesizeTopicInsight),
 * so we catch that specific invariant and run the function uncached.
 * Scripts are one-shot and don't need a persistent cache anyway.
 *
 * IMPORTANT: `unstable_cache` serializes results with `JSON.stringify`
 * (same file, line ~23). Only wrap functions whose return value is plain
 * JSON — no `Date`, `Map`, or class instances. A `Date` field would come
 * back as a string and break any consumer that calls a `Date` method.
 */
export function cachedRead<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  keyParts: string[],
  options: { revalidate: number; tags?: string[] },
): (...args: A) => Promise<R> {
  const cached = unstable_cache(fn, keyParts, options) as (...args: A) => Promise<R>;
  return async (...args: A): Promise<R> => {
    try {
      return await cached(...args);
    } catch (err) {
      const code = (err as { __NEXT_ERROR_CODE?: string } | null)?.__NEXT_ERROR_CODE;
      if (code === "E469" || (err instanceof Error && err.message.includes("incrementalCache missing"))) {
        return fn(...args);
      }
      throw err;
    }
  };
}
