# בדוק · Product Recommendations

Forward-looking ideas, ordered by impact-vs-effort. Items already in BACKLOG.md
are not repeated here. This doc focuses on the next class of feature
investments rather than bug-fixes or incremental polish.

## Tier 1 — Trust mechanics (do first)

These directly affect whether visitors trust the publication.

- **Human-reviewed badge.** Add a `humanReviewed: boolean` field on `Claim`
  and surface a separate visual treatment when an actual person (admin)
  has approved a claim through the admin claims editor. The current
  pipeline is fully AI, and the about page now says so explicitly; once
  the admin starts reviewing claims one-by-one, the badge becomes
  meaningful. Distinct visual language from the (silent) AI-second-pass
  approval. Suggested copy: "נסקרה ידנית".

- **Corrections log page** at `/corrections`. Lists every claim that was
  modified or removed after publication, with: original text, what was
  changed, when, and why. Mirrors what professional fact-check
  organisations do (e.g. PolitiFact's correction notices). Builds trust
  more than any badge ever can — visibly showing mistakes are owned
  beats claiming to be infallible. Implementation: append a `corrections`
  table (claimId, before, after, reason, timestamp) and write to it from
  the admin claims `updateClaim` action when verdict/explanation changes.

- **Per-source quality label.** Tag each `source` (Ynet, Walla, gov.il,
  Knesset transcript, etc.) with a tier: `official` (gov.il, LMS, Knesset),
  `primary-press` (Ynet, Haaretz, Israel Hayom), `secondary-press` (Walla,
  Maariv), `social` (X, Telegram). Display as a small chip next to the
  source name on claim cards / detail pages. Signals to the reader how
  authoritative the upstream source is. Schema: add a `sourceTier`
  enum-string to `Claim` populated at extraction time from a hand-curated
  source → tier map.

## Tier 2 — Reach and engagement

- **Claim submission flow.** Public form: "I heard X say Y on date Z" →
  enters a moderation queue → admin reviews and (if accepted) fact-checks
  it manually. Brings the audience into the production loop and exposes
  claims the automated cron misses (interviews, podcasts, talk shows).
  Schema: new `Submission` table similar to `Report` but with broader
  fields (politician, quote, where heard, link).

- **Better claim search.** Search by quote text and topic, not only
  politician name. Postgres full-text search on `Claim.quote +
  Claim.explanation + Politician.name` would cost nothing extra and
  unlock a "find a claim about ____" use case. Use `to_tsvector('hebrew',
  ...)` if the Hebrew dictionary is available, fall back to simple/
  `unaccent` otherwise.

- **Per-claim OG / WhatsApp images.** Currently every share gets the
  same generic site OG image. Generate a per-claim image with the
  verdict colour-band, politician avatar, and first ~12 words of the
  quote. Next.js `opengraph-image.tsx` route handler at
  `/claim/[id]/opengraph-image.tsx`. The existing /opengraph-image.tsx
  pattern (Satori) already handles RTL pre-reversal.

- **WhatsApp share preview hooks.** Add `<meta property="og:image:alt">`
  with the politician + verdict text so screen readers and link
  previewers render something meaningful even if image fetch fails.

## Tier 3 — Coverage signal

- **Methodology / coverage page** at `/methodology`. Currently `/about`
  mixes "who we are" with "how we work". Split them:
  - `/about` — funding, independence, who I am, contact.
  - `/methodology` — sources scanned (with last-fetched timestamp per
    source), how extraction works, calibration rules, known biases. Embed
    the daily article counts from `/admin/status` (deduplicated, no admin
    secret needed) so the page proves we're actually scanning. Strong
    trust signal — readers can verify we cover the sources we claim to.

- **What's missing page.** Visible list of politicians we know about
  but have zero or very few claims for, broken down by party. Encourages
  source submissions and shows we're not just covering the loudest
  voices. Already partially supported by `getUnrankedPoliticians`; just
  needs a public route.

- **Coverage gap dashboard.** Bar chart of daily claim counts across the
  last 30 days. Already have the data behind
  `scripts/claim-distribution.mts`. Surfacing it publicly shows the
  pipeline's heartbeat and any gaps where new RSS sources are needed.

## Tier 4 — UX polish (lower priority)

- **Permalinks for individual claims via topic combinations.** Already in
  BACKLOG.md — `/topic/[slug]` routes with stable slugs (chinukh, bituach,
  etc.) instead of the URL-encoded Hebrew param.

- **Dismissible disclaimer banner** with a cookie. Already in BACKLOG.md.

- **High-contrast mode + non-color verdict signals.** Already in
  BACKLOG.md under accessibility. Symbols (✓ / ~ / ✕) next to verdict
  badges so colour-blind readers and printed copies still work.

- **Subscribe to a politician** by email. "When a new claim about Smotrich
  drops, email me." Adds an audience-retention loop. Requires an email
  provider integration (Resend free tier) and a sub/unsub flow.

- **"Right of response" embed.** When a claim is about a politician, let
  their office submit a one-paragraph response via a tokenised link. The
  response embeds *under* the claim, marked as "תגובת לשכת ___". Real
  fact-check publications do this; it's a strong "we're not playing
  gotcha" signal.

## Things I'd specifically NOT do yet

- **Don't add user accounts.** Authentication is overhead. Reports +
  comments work without it, anonymously, with rate-limiting.
- **Don't gamify scores.** No "credibility leaderboard with medals" — it
  invites accusations of political bias.
- **Don't expand to non-Israeli politics.** Scope creep that would dilute
  the editorial focus. Build depth in the current market first.
- **Don't auto-publish without the second-pass verifier.** The whole trust
  model rests on that filter being in the loop. Lifting it for
  "throughput" would be a one-way door.

---

Reviewed and last updated: 2026-05-21.
