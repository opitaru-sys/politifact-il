# Split AI workloads across Gemini models to dodge the Tier 1 quota wall

**Status:** spec — pending approval
**Originating context:** 2026-05-27 outage. Editor sweep + topic-insights cron + Knesset drain on the same day blew through the 10K/day Gemini Flash quota. Editor and verifier silently fail-opened on quota errors. 73 live claims got published without editor review. Recent criteria additions (#9 / #10 / #11 / #15) caught nothing because the editor never ran.
**Owner:** Opitaru

## The problem

Every AI call in the pipeline currently uses `gemini-2.5-flash`. They all share one quota bucket: 10K requests/day on Tier 1. On a busy day (drains, sweeps, cron overlaps) that bucket empties before noon. When it empties:

- `verify-claim.ts` `verifyClaim()` fail-closes: returns approved=false. New claims get rejected mass-quietly.
- `editorial-review.ts` `editorialReview()` fail-opens: returns approved=true. New claims bypass editorial review and go live with no scrutiny.
- `fact-check.ts` `factCheckClaim()` throws. The whole article is logged-and-skipped.
- Synthesis modules (digest, topic-insights, report-recommendation) throw too.

Auto-tier upgrade to Tier 2 (50K+ RPD) is ~30-45 days away at current spend pace. We need a fix that works today.

## The principle

Different AI workloads have different quality requirements. Some are judgment-intensive (the grounded fact-check against Google Search; the journalist-voice synthesis). Others are pattern-matching against structured criteria (the verifier checking 15 rules; the editor checking 11 categories). The pattern-matchers can run on a smaller, faster model on a **separate quota pool**: `gemini-2.5-flash-lite`.

## The architecture

| Tier | Model | Used for | Rationale |
|---|---|---|---|
| Quality-critical | `gemini-2.5-flash` | Extraction + grounded fact-check (`fact-check.ts`), digest synthesis (`digest-synthesis.ts`), topic insight synthesis (`topic-insight-synthesis.ts`) | Extraction quality cascades through the pipeline. Synthesis is published editorial product. Grounding only runs on Flash. |
| Structured judgment | `gemini-2.5-flash-lite` | Verifier (`verify-claim.ts`), editor (`editorial-review.ts`), report recommendation (`report-recommendation.ts`) | Classification against numbered criteria. Lite handles this at ~95% of Flash quality. Separate daily quota bucket. |

`gemini-2.5-flash-lite` has a **separate per-model daily quota** on Tier 1. Splitting effectively doubles processing capacity instantly, without a tier upgrade.

## Why this is safe

The Lite model is the right call for verifier + editor specifically because:

1. **Structured criteria, not unstructured judgment.** Verifier prompt has 15 numbered rules; editor has 11. Each is "does this quote match this pattern?". Lite handles classification well.
2. **Existing fail-safe wrappers stay in place.** Verifier fails closed; editor fails open. If Lite produces a worse decision in some edge case, the same downstream sweeps catch it.
3. **Existing sweep scripts give us a quality dial.** `apply-editorial-review.mts` can re-run with Flash via env override if Lite turns out too lenient.

Report recommendation is similar — classification into four actions (hide / change_verdict / edit_explanation / dismiss). Low-stakes, admin-reviewable.

## Why digest + topic-insights + extraction stay on Flash

- **Extraction** has a long structured prompt that needs to find political claims in raw article text. Quality cascades through the whole pipeline. Worth keeping on Flash.
- **Digest + topic-insight synthesis** produces published editorial prose. The journalist-voice prompt is model-sensitive. Lite produced noticeably weaker Hebrew journalistic output in informal testing.
- **Grounded fact-check** has to run on Flash anyway — Lite doesn't support grounding.

## Implementation

Single new file `src/lib/gemini-models.ts`:

```typescript
/**
 * Centralized Gemini model assignments. Keeping these in one place so a
 * model upgrade or quota-driven re-shuffle is a one-file change.
 *
 * Why split: every workload using `gemini-2.5-flash` shares one daily
 * quota bucket. On Tier 1 that's 10K req/day. Editor sweep + topic
 * insights cron + Knesset drain on the same day will exhaust it. When
 * it exhausts, the editor fails-open and unreviewed claims go live.
 */

/** Quality-critical workloads. Extraction, grounded fact-check, editorial
 *  prose synthesis (digest, topic insights). */
export const MODEL_FLASH = "gemini-2.5-flash";

/** Structured judgment workloads on a separate quota pool. Verifier
 *  (15 rules), editor (11 categories), report recommendation. Cheaper
 *  per call, ~95% quality on classification, separate daily quota. */
export const MODEL_LITE = process.env.BADAK_LITE_MODEL ?? "gemini-2.5-flash-lite";
```

Then in each consumer:

- `src/lib/verify-claim.ts`: change `const MODEL = "gemini-2.5-flash"` (line 25) → `import { MODEL_LITE as MODEL } from "./gemini-models"`
- `src/lib/editorial-review.ts` (line 31): same as verifier
- `src/lib/report-recommendation.ts` (line 22): same
- `src/lib/fact-check.ts` (line 80): change to import `MODEL_FLASH as MODEL` (no behavior change, just routing through the central module)
- `src/lib/digest-synthesis.ts` (line 29): same as fact-check
- `src/lib/topic-insight-synthesis.ts` (line 24): same

Six imports + one new file.

## Quota math (back-of-envelope)

Current Tier 1 daily quotas (approx, varies by recent Google adjustments):
- `gemini-2.5-flash`: 10K RPD
- `gemini-2.5-flash-lite`: ~10-15K RPD (separate pool)

Daily call volume in steady state:
- Extraction: ~200/day (Flash)
- Grounded fact-check: ~100/day (Flash)
- Verifier: ~100/day (Flash → Lite after)
- Editor: ~80/day (Flash → Lite after)
- Digest synthesis: ~1/week (Flash)
- Topic insights: ~13/week (Flash)
- Report recommendations: ~5/day (Flash → Lite after)
- Sweep operations: spiky, +1000-3000 on sweep days

After split:
- **Flash bucket: ~300/day steady** (extraction + fact-check + synthesis). Plenty of headroom under 10K. Sweeps that hit the fact-check path still hit Flash.
- **Lite bucket: ~185/day steady** (verifier + editor + recommendations). Editor sweeps move entirely off Flash onto Lite, so they can't take down the production pipeline.

## Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Lite produces noticeably worse verifier decisions | Medium | Sweep + manual review will catch quality regressions within a day. Env override (`BADAK_LITE_MODEL=gemini-2.5-flash`) reverts instantly. |
| Lite has different JSON output reliability | Low-medium | Both modules use `responseMimeType: "application/json"` with schema. Should be model-agnostic. |
| Lite's separate quota also hits cap on sweep days | Low | At ~3K claims/sweep, ~30% of Lite's daily quota. Headroom preserved for normal traffic. |
| Lite pricing changes (Google has reshuffled before) | Low | Centralized constant. One-file change to remap. |

## Verification approach

No formal tests in this repo. Verification is:

1. **Type-check clean** after the change.
2. **Run verifier on 20 random recent claims manually** and compare verdict distribution to a parallel Flash run. Approval rate within ±5%.
3. **Run editor on 20 random recent claims similarly.** Rejection counts within ±10% of historical Flash editor runs.
4. **Watch dev server logs for one full day cycle.** Look for: empty JSON responses, schema mismatches, unexpected 4xx errors. Either suggests prompt needs tuning for Lite.
5. **Re-run the apply-editorial-review sweep** on the live claims backlog from today's outage. Verify rejection rate on Lite is in the same ballpark as historical Flash sweeps.

If verification shows quality regression: set `BADAK_LITE_MODEL=gemini-2.5-flash` in `.env.local` and GH Actions secrets. Workload reverts to Flash with no code change.

## Cost impact

Roughly neutral, slightly cheaper. `gemini-2.5-flash-lite` is priced lower than Flash (~$0.10/Mtok input vs ~$0.30/Mtok). Verifier + editor + recommendation are short prompts (~3-5K tokens each). Expected savings: ~$0.50-1.50/day. Cost savings are a small bonus; the point is quota resilience.

## Out of scope

- **Cross-provider fallback** (OpenRouter / Claude / OpenAI). Different design problem; not needed if model split solves the quota wall.
- **Pre-filter to skip editor on high-confidence claims.** Worth doing as a follow-up if Lite split alone isn't enough headroom.
- **Quota monitoring + admin dashboard alert.** Real concern but separate work. Model split removes the most acute failure mode (silent editor outage).
- **Topic-insights moved off cron.** Different option entirely; consider after model split is proven.

## Memory updates after implementation

- Update `claude_pricing_constraint.md` to note the Lite/Flash split as a Gemini quota mitigation pattern.
- Update `cost_realities.md` to reflect cheaper per-call cost on Lite workloads.
- Update `quality_gate_triple_defense.md` to note that the verifier + editor now use Lite — important for anyone debugging quality regressions later.

## Success criteria

- All six workload modules import their model from `src/lib/gemini-models.ts`.
- Type-check clean.
- 20-claim manual verifier-on-Lite run produces approvals within ±5% of the same claims on Flash.
- 20-claim manual editor-on-Lite run produces rejection counts within ±10% of historical Flash editor runs.
- Next cron cycle completes without editor fail-opens (i.e. > 0 of the day's live claims have `verifierNotes` starting with `[עורך]`).
- Env override path documented + tested (`BADAK_LITE_MODEL=gemini-2.5-flash` routes back to Flash).
