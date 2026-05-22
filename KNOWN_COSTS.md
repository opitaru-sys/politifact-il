# בדוק · Known costs and unit math

Reality-tested per-request costs for the Gemini-based pipeline.
Initial estimates underestimated grounded fact-check cost by ~5x.
This doc is the corrected math so we don't repeat that mistake.

## Per-request unit costs (Gemini 2.5 Flash on Google AI / Cloud, May 2026)

| Step | Tokens in | Tokens out | Tool calls | Cost / call |
|---|---|---|---|---|
| Extraction (no grounding) | ~3-5K (article body + prompt) | ~200-500 (JSON list) | 0 | **~$0.0015** |
| Fact-check, GROUNDED (`googleSearch` tool) | ~30-80K (search results + prompt) | ~500-1500 (JSON answer) | 1 Google search request | **~$0.05-0.07** |
| Fact-check, NO grounding | ~2-3K (prompt + quote) | ~500-1000 (JSON answer) | 0 | **~$0.0015** |
| Verifier (no grounding) | ~1.5K (prompt + claim) | ~100-300 (JSON verdict) | 0 | **~$0.0008** |

### Why grounding is so expensive

The grounded fact-check looks cheap on paper ($35/1000 grounding requests
above the 500/day free tier). The real cost is **the search results
themselves**, which Google returns inline. Each grounded answer pulls
30-80K input tokens of source snippets back into the model's context.
At $0.30/M input that's $0.009-0.024 per call **just for the input tokens**,
on top of the grounding fee. The model also produces a longer answer
because it's reasoning over more material.

When estimating, assume:
- Grounded fact-check = **$0.05/claim**, not $0.01.
- Free grounding tier = 500 reqs/day. Above that, $35/1000 grounding
  requests on top of token costs.

## Per-pipeline costs (typical day)

Assuming the production daily cron with cap of 50 articles:

| Step | Count | Unit | Sub-total |
|---|---|---|---|
| Extraction calls | 50 | $0.0015 | $0.075 |
| Articles with claims (after filter) | ~10 | — | — |
| Claims extracted | ~15 (avg ~1.5/yielding-article) | — | — |
| Fact-check (grounded) | ~15 | $0.05 | $0.75 |
| Verifier | ~15 | $0.0008 | $0.012 |
| **Total daily cron** | | | **~$0.85 / day ≈ ₪3 / day** |
| Monthly | | | **~₪90 / month** |

## One-off bulk operations (don't underestimate these)

| Operation | When run | Claim-producing calls | Approx cost |
|---|---|---|---|
| `refact-check-all.mts` on ~200 claims | After a prompt change | ~200 × ($0.05 + $0.0008) | ~$10 |
| Bulk drain (3500-article Knesset backfill), grounded | If you ever run it | ~3500 × 10% × ($0.05 + $0.0008) | ~$18 |
| Bulk drain, grounding OFF (`BADAK_DISABLE_GROUNDING=1`) | Recommended for bulk work | ~3500 × 10% × ($0.0015 + $0.0008) | ~$0.80 |
| Restart-the-drain-three-times-with-grounding | What we accidentally did on May 21 | adds up fast | **~$55 actual** |

**Rule of thumb:** any operation that triggers >100 grounded fact-checks
needs a moment of thought first. If it's a backfill (not live data),
set `BADAK_DISABLE_GROUNDING=1` and accept the verifier rejecting more
current-event claims.

## Free-tier limits worth knowing

- Gemini Flash: 60 requests/minute on free tier; 1500 on paid.
- Google Search grounding: 500 grounded requests/day free, then
  $35/1000 — and the per-request token costs above apply on top.
- Daily Anthropic Claude Sonnet 4.6 (legacy, no longer used): ~$0.20/claim
  with web_search vs ~$0.05 for Gemini. Migration to Gemini saved ~4-10x.

## How to keep the bill bounded

1. **Vercel doesn't bill us for the Gemini work.** All Gemini cost is
   billed by Google Cloud against the project linked to `GEMINI_API_KEY`.

2. **Set a Google Cloud budget alert.** Billing → Budgets & Alerts.
   Suggested: ₪50/month threshold for an email warning, ₪100 hard
   cap to disable the project. Takes 2 minutes.

3. **Daily cron has a 50-article cap.** `scripts/daily.mts` line 79.
   Hard ceiling per run.

4. **`shouldSkipExtraction()` pre-filter** in `fact-check.ts` short-
   circuits articles unlikely to yield claims before any LLM call.
   Saves ~30-40% of extraction calls on the Knesset corpus.

5. **`knessetSpeakerInMap()` pre-filter** skips Knesset transcript
   blocks whose speaker isn't in NAME_TO_ID. Each skipped article
   saves one full extraction call.

6. **Drain backfills should default to grounding-off.** The
   `BADAK_DISABLE_GROUNDING=1` env switch is on the drain script
   contract. Use it.

7. **Don't restart a long-running drain after partial failures.**
   The 429-rate-limit batches at the end of a long drain mean you've
   hit a daily limit — wait until the next day, don't relaunch.

## Cost history (audit trail)

| Date | What happened | Approx cost |
|---|---|---|
| 2026-05-19 | Anthropic Sonnet 4.6 + web_search pipeline | ~$5 |
| 2026-05-20 | Same, plus heavy debugging | ~$18 |
| 2026-05-21 | Migrate to Gemini; refact-check-all; first bulk drain attempts (3 restarts with grounding) | ~$55 (the bill that triggered this doc) |
| 2026-05-22 | Final bulk drain (grounding off), mop-up | ~$1 |
| 2026-05-22 | Pipeline scheduler stood up: ingest-every-30-min, fresh-every-2h | n/a |
| Ongoing | Daily cron + 30-min ingest + 2h fresh (limit=60) | **~$3-5/day projected** |
