# בדוק · Product Backlog

Living document. Tier order = priority. Check items off as they ship.
Last reconciled: 2026-05-23.

## Now / blocking

- [ ] **`bduk.co.il` DNS** — domain bought, Galcomm DNS records correctly configured, but the `.il` registry (ISOC-IL) still hasn't published it to the public zone. Support ticket with Galcomm. Site lives at `politifact-il.vercel.app` until then. When DNS publishes: delete the `SITE_URL` GitHub secret (it overrides the hardcoded `https://bduk.co.il` default in the workflows).
- [ ] **Rotate `ADMIN_SECRET`** — value was pasted into chat in a previous session. Regenerate, update in Vercel + GitHub secret + `.env.local`.
- [ ] **Set Google Cloud budget alert** at ₪100-200/month. Without this, a runaway script could be expensive before you notice.
- [ ] **Spot-check 10-20 visible claims by hand** before any public PR push. AI-only review still misses things; a human pass on ~10% is the right pre-launch hygiene.

## High-impact next

- [ ] **Neon serverless adapter** (`@prisma/adapter-neon` + `@neondatabase/serverless`) — HTTP instead of TCP, handles cold-starts gracefully. Eliminates the 500-on-first-request-after-suspend issue. ~1 hour.
- [ ] **More reliable cron than GitHub Actions free tier.** Schedules can be delayed 15-60 min during high system load. Pipeline is idempotent so missed ticks self-heal. Options: Vercel Cron Pro ($20/mo), Upstash QStash, $1/mo VPS with system cron. Lean QStash. ~30 min.

## Tier 1 · Data sources

- [ ] **Government press releases** — `gov.il` per-ministry feeds (PMO, Treasury, Defense, Education).
- [ ] **Politicians' X/Twitter feeds** — direct quotes, dated, attributable. Via Nitter mirrors or playwright scraper. ~50 active politicians.

## Tier 2 · Data (higher effort)

- [ ] **YouTube interview transcripts** — Channel 12 morning shows, Patriotim, GLZ podcasts. Whisper for captions.
- [ ] **Existing fact-check coverage** — scrape Mako, Walla, Channel 12 fact-check sections; ingest with their verdicts.
- [ ] **Historical RSS backfill** — Israeli news sites have archive pages (e.g., `ynet.co.il/news/category/X?page=N`). Could write per-site scrapers to backfill weekend/holiday gaps. Brittle, ~6-10 hours dev each. Low ROI vs the Tier 1 items.

## Trust mechanics (next pre-launch milestone)

- [ ] **Human-reviewed badge** — `humanReviewed: boolean` field + distinct UI badge for claims an admin manually approved. Distinct from the silent AI second-pass approval that exists today.
- [ ] **Corrections log page** at `/corrections` — lists every claim modified/removed after publication. Builds trust by visibly owning mistakes.
- [ ] **Per-source quality tier** — tag each source as official/primary-press/secondary-press/social. Small chip next to source name.
- [ ] **Claim submission flow** — public form: "I heard X say Y on date Z" → moderation queue → admin reviews.
- [ ] **Methodology / coverage page** at `/methodology` — split out from `/about`. Show sources scanned + last-fetched per source + claim yield. Strong trust signal.

## Polish

- [ ] **Search by topic and claim text** — Postgres FTS on `quote + explanation + politician name`. Currently search is politician-only.
- [ ] **Per-claim OG image** (next/og route at `/claim/[id]/opengraph-image.tsx`). Politician avatar + verdict band + first 12 words of quote.
- [ ] **Subscribe to a politician by email** — Resend free tier + sub/unsub flow.
- [ ] **"Right of response" embed** — tokenised link for politicians' offices to add a one-paragraph response to a claim about them.
- [ ] **Dismissible disclaimer banner** (cookie-based).
- [ ] **"Report a missing politician" form**.
- [ ] **Accessibility** — high-contrast mode, non-color verdict signals (symbols ✓ / ~ / ✕ next to badges for colour-blind and printed).
- [ ] **Comparison view polish** — `/compare` exists but could use a deeper feature comparison.
- [ ] **Expose comment count near verdict** on the card.
- [ ] **Per-source health badge in admin** — flag a source with a red dot if last successful fetch was >24h ago.

## Recently shipped (do not re-litigate)

- Gemini 2.5 Flash + Google Search grounding pipeline (replaced Anthropic Sonnet + web_search — see `KNOWN_COSTS.md`).
- Three-lane processing in `scripts/daily.mts`: fresh RSS first, then Knesset ingest, then RSS backlog, then Knesset backlog (grounding off by default for Knesset).
- GitHub Actions cron: `rss-ingest` (30min), `fresh-process` (2h), `daily-ingest` (06+07 UTC).
- `/api/process?mode=fresh|rss-backlog|knesset|all` endpoint with `Authorization: Bearer ADMIN_SECRET`.
- Strict extraction prompt (rejects rhetoric, slogans, procedural Knesset content).
- Verifier criteria 7-tier with "verdict reflects content, not attribution" check.
- Three-layer claim-date threading so "we are now in March" Knesset quotes aren't judged against today's May date.
- Unified `?window=` selector (1/7/30/60/90 days, default 30; no "all") on home/leaderboard/politician — controls hero, leaderboard preview, AND the recent-claims feed in one filter.
- Tie-breaking by total-claims at both ends of the leaderboard (more claims wins ties).
- Claim detail page rewritten as an evidence file with ClaimReview JSON-LD.
- Admin: claim editor (`/admin/claims`), reports with dismiss + edit links, status with schedule + queue-age + daily-snapshot card.
- `DailySnapshot` Prisma model written at end of each daily cron run.
- Ben Gurion headstand spinner replaces the previous text-only loading state.
- All 29 politicians with claims have images (mix of local + Wikipedia-fetched).
- 14 RSS feeds (real-browser UA for Israel Hayom + Calcalist 403 fix).
- Public queries filter `editorApproved: true` everywhere; sweep scripts in `/scripts` for cleanup.
- Manual cleanup last run: ~93 Knesset roll-calls rejected; ~674 unverifiable-explanation claims unapproved (214 of which were publicly visible); 16 dedup duplicates removed.
- Mobile fixes: report button is bottom-sheet, AI disclaimer is full-text on every viewport, beta strip is compact on small screens.

## Memory (still true, don't re-litigate)

- Stats window selector is `1/7/30/60/90` days, default 30; "all-time" was deliberately removed.
- `MIN_CLAIMS_FOR_RANKING = 3`, `MIN_CLAIMS_FOR_HERO = 3`.
- No em-dashes in UI copy.
- Civic Press: cream, ink, press-red accent; no emojis in chrome; wordmark logo with niqqud (בָּדוּק).
- Satori (next/og) doesn't apply Hebrew bidi; pre-reverse strings in OG image source.
- Comment + report APIs rate-limited via Upstash (5/min, 3/min).
- Anthropic SDK was uninstalled. Don't re-introduce it; the migration to Gemini is final.
- The `BADAK_DISABLE_GROUNDING=1` env switch is for bulk drains only; the daily cron's fresh-news lane MUST keep grounding ON.
