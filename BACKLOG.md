# בדוק · Product Backlog

Living document. Tier order = priority. Check items off as they ship.

## Now / blocking

- [ ] **User: update Vercel `DATABASE_URL`** to the current Neon hostname `ep-shy-wave-alfwufzp-pooler.c-3.eu-central-1.aws.neon.tech` (was `ep-silent-glade-alpoei6t-pooler`). Until done, prod 500s. Settings → Env Vars → Edit → Save → Redeploy.
- [ ] **Galcomm verification email pending** — domain `bduk.co.il` paid but not registered until ISOC-IL verification clicked. Support ticket open; awaiting Galcomm reply.
- [ ] **Add DNS A record** at Galcomm once domain is verified: `@ → 216.198.79.1`. Plus CNAME `www → cname.vercel-dns.com`.

## High-impact next

- [x] **Anthropic web_search in fact-check pipeline** — DONE. `factCheckClaim()` now declares the `web_search_20260209` tool with `max_uses: 3` and Israeli `user_location`. Prompt instructs the model to search for current events / recent data before deciding. Response parser updated to pick the LAST text block (after interleaved `server_tool_use` / `web_search_tool_result` blocks). Cost: ~$0.025 + up to 3×$0.01 per claim → max ~$0.055/claim, ~$1.65/day at 30 claims/day. Next run will exercise it.
- [ ] **Neon serverless adapter** (`@prisma/adapter-neon` + `@neondatabase/serverless`) — uses HTTP instead of TCP, handles cold-starts gracefully. Eliminates the 500-on-first-request-after-suspend issue. ~1 hour.
- [ ] **Spot-check 10-20 verified claims by hand.** No human review yet — even after the second-pass AI verifier, some claims may have wrong verdicts. A human pass on ~10% of claims before any PR push is the right pre-launch hygiene.

## Tier 1 · Data expansion (current cron handles this organically)

- [x] **Knesset plenary transcripts ingest** — DONE. `src/lib/knesset-ingest.ts` uses OData + word-extractor.
- [x] **Loosen extraction criteria** — DONE. Plus added today's-date preamble + cutoff-awareness instruction.
- [x] **Expand curated seed set** — Replaced by AI extraction from real sources; seeds were fictional and deleted.

## Tier 2 · Data sources (later)

- [ ] More political RSS: Globes, Calcalist, TheMarker, Channel 13 news, Davar, 103FM, Mako standalone.
- [ ] Government press releases — `gov.il` per-ministry feeds (PMO, Treasury, Defense, Education).

## Tier 3 · Data (higher effort)

- [ ] Politicians' X/Twitter feeds — direct quotes, dated, attributable. Via Nitter mirrors or playwright scraper. ~50 active politicians.
- [ ] YouTube interview transcripts — Channel 12 morning shows, Patriotim, GLZ podcasts. Whisper for captions.
- [ ] Existing fact-check coverage — scrape Mako, Walla, Channel 12 fact-check sections; ingest with their verdicts (skip our AI).

## Credibility fixes

- [x] **Hero card framing** — superlative → positional, sample disclaimer promoted, breakdown next to %, less celebratory color.
- [ ] **Editor-approved badge** — schema field + UI badge for claims manually reviewed. Even 10% reviewed changes the trust posture.
- [ ] **Small-sample caveat on politician pages** — currently a politician with 1 true claim shows 100% in big green. Apply same disclaimer pattern as hero when `claims.length < 3`.
- [ ] **Curated verification sources panel** — replace removed `factSourceUrl` links with a static "מקורות מומלצים לאימות" block (gov.il/cbs, knesset.gov.il, mevaker.gov.il) on each claim card. User has *some* way to verify.
- [ ] **Tighten extraction to require quotation marks** — current AI sometimes pulls journalist paraphrases. Force the source to contain quoted speech (or paraphrase explicitly tagged).
- [ ] **TL;DR summary** — claim explanations run 200+ words. Generate a one-sentence TL;DR via the same AI call; collapse the long explanation behind "הסבר מלא ↓".
- [ ] **Financial disclosure** — about page must say "no funding, no party donations, no paid staff" prominently. For a fact-check site, the financial disclosure IS the trust signal.

## Readability / structure

- [ ] **Permalinks for individual claims** — `/claim/[id]` route. Click on card → claim page. Shareable.
- [ ] **Consistent date format with year** — "17 במאי 2026" everywhere; never bare "17 במאי" or "16/04/2026".
- [ ] **Show unranked politicians** — list of politicians in DB without enough claims yet, on leaderboard page. Explains absence, signals coverage.
- [ ] **Date range filter on home feed** — URL param `?days=7|30|90|365`.
- [ ] **Politician filter on home feed** — URL param `?politician=X` (in addition to topic).
- [ ] **Comparison view** — `/compare?a=netanyahu&b=lapid` route with side-by-side stats and claim mix.
- [ ] **Expose comment count near verdict** — make community discussion visible, not buried.

## Smaller polish

- [ ] Dismissible disclaimer banner (cookie-based).
- [ ] "Report a missing politician" form.
- [ ] Search by topic and claim text, not only names.
- [ ] Accessibility: high-contrast mode, non-color verdict signals.
- [ ] Remove or repurpose mysterious floating profile icon at bottom-left of mobile.
- [ ] Per-claim OG image (instead of single site-wide thumbnail).

## Memory of past sessions (do not re-litigate)

- 30-day rolling window for stats. `STATS_WINDOW_DAYS=30`, `MIN_CLAIMS_FOR_HERO=3`, `MIN_CLAIMS_FOR_RANKING=1`.
- No em-dashes in UI copy. Use commas, periods, or `|`.
- Civic Press design system: cream, ink, press-red accent only; no emojis in chrome; wordmark logo only.
- Satori (next/og) doesn't apply Unicode bidi; Hebrew strings must be pre-reversed in OG image source.
- Comment + report APIs have in-memory rate limiting (5/min and 3/min respectively).
- Hosting plan: Vercel + Neon Postgres, not started.
