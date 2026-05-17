# בדוק · Product Backlog

Living document. Tier order = priority. Check items off as they ship.

## Tier 1 · Data expansion

- [ ] **Knesset plenary transcripts ingest** — Build parser for the OData API (`knesset.gov.il/Odata/ParliamentInfo.svc/`) or scrape session pages on `main.knesset.gov.il`. Every MK speech is a verbatim public quote. Highest-volume single source. ~1 day initial build, 30 min/week ongoing.
- [ ] **Loosen extraction criteria** — Current prompt rejects rhetoric and anything bundled with opinion. Loosen to accept any verifiable factual claim even when mixed with rhetoric. Trade-off: more borderline cases. Compensate by saving and displaying `confidence`. ~2-3 hours.
- [ ] **Expand curated seed set** — Manually add 50-100 verified claims to `scripts/seed-real-claims.mjs`. Instant data, high quality. ~2-3 hours.

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
