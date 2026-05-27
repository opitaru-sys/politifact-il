/**
 * Fetch + extract readable text from a public news article URL.
 *
 * Used at ingest time (`src/lib/ingest.ts`) when the RSS feed only
 * supplies a short snippet — without this, the AI sees ~200 chars of
 * teaser and correctly extracts zero quotes, which leaves the queue
 * full of "processed but empty" articles. Body-fetch shifts those
 * articles into yielding real claims.
 *
 * Used to live as a private helper in `fact-check.ts` (and went unused
 * there). Extracted on 2026-05-27 so `ingest.ts` can call it without
 * pulling in the rest of fact-check.
 *
 * Best-effort:
 *   - 10s timeout per fetch
 *   - Naive HTML strip (good enough for the AI to find quotes; we
 *     don't need perfect readability)
 *   - 8000-char cap to keep prompt sizes bounded
 *   - Returns null on any failure (HTTP error, timeout, block);
 *     caller falls back to the RSS snippet
 *
 * The browser User-Agent matters: many Israeli news sites return 403
 * to identifiable bot UAs. Chrome-on-Mac is the safest disguise.
 */
export async function fetchArticleBody(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
    return text.substring(0, 8000);
  } catch {
    return null;
  }
}
