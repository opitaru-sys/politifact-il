/**
 * Centralized Gemini model assignments. Keeping these in one place so a
 * model upgrade (or a quota-driven re-shuffle) is a one-file change.
 *
 * Why split: every workload using `gemini-2.5-flash` shared one daily
 * quota bucket. On Tier 1 that's 10K req/day. The 2026-05-27 outage:
 * editor sweep + topic-insights cron + Knesset drain on the same day
 * exhausted the bucket; the editor silently fail-opened and 73 live
 * claims went up without editor review. Splitting the heavy-but-cheap
 * structured-classification workloads (verifier, editor, report
 * recommendation) onto a different model uses a separate daily quota
 * pool, so a sweep day can no longer take down the production pipeline.
 *
 * See docs/superpowers/specs/2026-05-27-split-models-by-workload-design.md
 * for the full rationale.
 */

/** Quality-critical workloads. Extraction, grounded fact-check, editorial
 *  prose synthesis (digest, topic insights). Grounding only runs on Flash
 *  so the grounded fact-check has no other option anyway. */
export const MODEL_FLASH = "gemini-2.5-flash";

/** Structured judgment workloads on a separate daily quota pool.
 *
 *  Used by: verifier (15 numbered rules), editor (11 numbered categories),
 *  report recommendation (4 action types). Lite handles classification
 *  against numbered criteria at ~95% the quality of Flash per Google's
 *  published benchmarks, on substantially less daily quota pressure.
 *
 *  Env override: set BADAK_LITE_MODEL=gemini-2.5-flash to instantly
 *  revert any of these workloads back to Flash without a code change.
 *  Documented in `claude_pricing_constraint.md` memory as the emergency
 *  knob if Lite ever produces noticeably worse decisions. */
export const MODEL_LITE = process.env.BADAK_LITE_MODEL ?? "gemini-2.5-flash-lite";
