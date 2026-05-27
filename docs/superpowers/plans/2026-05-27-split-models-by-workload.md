# Split AI Workloads Across Gemini Models — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the verifier / editor / report-recommendation modules off `gemini-2.5-flash` onto `gemini-2.5-flash-lite` (separate Tier-1 daily quota pool) so a sweep day can no longer take down the production pipeline. Quality-critical workloads (extraction, grounded fact-check, editorial synthesis) stay on Flash.

**Architecture:** One new module `src/lib/gemini-models.ts` exports `MODEL_FLASH` and `MODEL_LITE` constants (Lite resolves via `BADAK_LITE_MODEL` env override for emergency revert). Six existing modules switch from a local `const MODEL = "gemini-2.5-flash"` to importing the right symbol. Tiny refactor.

**Tech Stack:** TypeScript, `@google/genai` SDK, Next.js 16. No test framework in this repo — verification is type-check + 20-claim manual comparison + watch one cron cycle for empty-response errors.

**Repo conventions used by this plan:**
- All Gemini calls live in `src/lib/*.ts`. Each module today has a top-level `const MODEL = "gemini-2.5-flash"`.
- Commits use the trailer `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- `npx tsc --noEmit` is the type-check command. Should be clean before each commit.
- Memory files live OUTSIDE the repo at `C:\Users\User\.claude\projects\C--Users-User-Desktop-ISR-Politicians-Fact-Check\memory\` — no commits.
- Standing rule: never push without explicit user instruction in that message.

---

## File Structure

**Created:**
- `src/lib/gemini-models.ts` — exports `MODEL_FLASH` (the literal string) and `MODEL_LITE` (env-overridable). Single source of truth for model selection.

**Modified (each file changes only its `MODEL` declaration):**
- `src/lib/verify-claim.ts` — switches to `MODEL_LITE`
- `src/lib/editorial-review.ts` — switches to `MODEL_LITE`
- `src/lib/report-recommendation.ts` — switches to `MODEL_LITE`
- `src/lib/fact-check.ts` — switches to `MODEL_FLASH` (no behavior change; just routes through the central module)
- `src/lib/digest-synthesis.ts` — switches to `MODEL_FLASH` (same)
- `src/lib/topic-insight-synthesis.ts` — switches to `MODEL_FLASH` (same)

**Memory updates (outside repo, no commit):**
- `claude_pricing_constraint.md` — note the Lite/Flash split as a Gemini quota mitigation pattern
- `cost_realities.md` — reflect cheaper per-call cost on Lite workloads
- `quality_gate_triple_defense.md` — note verifier + editor now use Lite

Why a centralized module: a future model upgrade (or another quota reshuffle) becomes a one-file change instead of a six-file grep-and-replace. Also gives one well-commented place to explain *why* the split exists, so the next person debugging quality regressions can find the context.

---

## Task 1: Create the centralized model module

**Files:**
- Create: `src/lib/gemini-models.ts`

- [ ] **Step 1: Write the module**

```typescript
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean (no output).

- [ ] **Step 3: Commit**

```bash
git add src/lib/gemini-models.ts
git commit -m "$(cat <<'EOF'
Gemini models: centralize Flash + Flash-Lite selection

One module that exports the two model constants the rest of the
pipeline imports. Lite is env-overridable via BADAK_LITE_MODEL so
any workload can revert to Flash with no code change if Lite turns
out worse on quality.

Subsequent commits in this set move the six existing per-module
MODEL declarations onto these constants. See spec at
docs/superpowers/specs/2026-05-27-split-models-by-workload-design.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Move verifier to Flash-Lite

**Files:**
- Modify: `src/lib/verify-claim.ts` (line 25 — the `const MODEL = ...` declaration)

- [ ] **Step 1: Find the existing declaration**

Run: Grep for `const MODEL` in `src/lib/verify-claim.ts`. It's a single line, currently:

```typescript
const MODEL = "gemini-2.5-flash";
```

- [ ] **Step 2: Replace the declaration with an import**

Change the line to:

```typescript
import { MODEL_LITE as MODEL } from "./gemini-models";
```

This import goes in the existing imports section near the top of the file (not where the constant is). Then DELETE the old `const MODEL = "gemini-2.5-flash";` line.

Rename trick: importing as `MODEL` keeps every call site inside `verify-claim.ts` working without further changes. No call-site edits needed.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/verify-claim.ts
git commit -m "$(cat <<'EOF'
Verifier: switch to gemini-2.5-flash-lite

Imports MODEL_LITE (aliased to MODEL so call sites are unchanged).
Verifier checks 15 numbered rejection criteria — Lite handles
structured classification well at this size. Off the shared Flash
quota means a sweep day no longer makes the verifier fail-closed
mid-pipeline.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Move editor to Flash-Lite

**Files:**
- Modify: `src/lib/editorial-review.ts` (line 31)

- [ ] **Step 1: Find + replace the MODEL declaration**

Same pattern as Task 2. Add to imports:

```typescript
import { MODEL_LITE as MODEL } from "./gemini-models";
```

Delete the existing `const MODEL = "gemini-2.5-flash";`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/editorial-review.ts
git commit -m "$(cat <<'EOF'
Editor: switch to gemini-2.5-flash-lite

Imports MODEL_LITE aliased to MODEL. Editor checks 11 numbered
rejection categories — same structured-classification pattern as the
verifier. Critically also moves the apply-editorial-review.mts sweep
off Flash so a corpus-wide sweep can't exhaust the fact-check quota.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Move report-recommendation to Flash-Lite

**Files:**
- Modify: `src/lib/report-recommendation.ts` (line 22)

- [ ] **Step 1: Find + replace the MODEL declaration**

Same pattern. Add to imports:

```typescript
import { MODEL_LITE as MODEL } from "./gemini-models";
```

Delete the existing `const MODEL = "gemini-2.5-flash";`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/report-recommendation.ts
git commit -m "$(cat <<'EOF'
Report recommendation: switch to gemini-2.5-flash-lite

Classifies reports into 4 action types (hide / change_verdict /
edit_explanation / dismiss). Structured classification; Lite is the
right size. Admin-only surface so even worst-case quality slips
get caught at the admin's eye before applying.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Route fact-check.ts through the central module (no behavior change)

**Files:**
- Modify: `src/lib/fact-check.ts` (line 80)

- [ ] **Step 1: Find + replace the MODEL declaration**

Add to imports:

```typescript
import { MODEL_FLASH as MODEL } from "./gemini-models";
```

Delete the existing `const MODEL = "gemini-2.5-flash";`.

The resolved value is identical to before (`"gemini-2.5-flash"`). The point is to route the choice through the central module so future model bumps are one-file changes.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/fact-check.ts
git commit -m "$(cat <<'EOF'
fact-check: route MODEL through gemini-models module

No behavior change — still uses gemini-2.5-flash for extraction and
the grounded fact-check call. Routing through the central constant
so a future model upgrade is a one-file change instead of a
multi-module grep.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Route digest-synthesis.ts through the central module (no behavior change)

**Files:**
- Modify: `src/lib/digest-synthesis.ts` (line 29)

- [ ] **Step 1: Find + replace the MODEL declaration**

Add to imports:

```typescript
import { MODEL_FLASH as MODEL } from "./gemini-models";
```

Delete the existing `const MODEL = "gemini-2.5-flash";`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/digest-synthesis.ts
git commit -m "$(cat <<'EOF'
Digest synthesis: route MODEL through gemini-models module

No behavior change — published editorial prose stays on Flash where
the journalist-voice prompt has been tuned. Centralization only.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Route topic-insight-synthesis.ts through the central module (no behavior change)

**Files:**
- Modify: `src/lib/topic-insight-synthesis.ts` (line 24)

- [ ] **Step 1: Find + replace the MODEL declaration**

Add to imports:

```typescript
import { MODEL_FLASH as MODEL } from "./gemini-models";
```

Delete the existing `const MODEL = "gemini-2.5-flash";`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/topic-insight-synthesis.ts
git commit -m "$(cat <<'EOF'
Topic insight synthesis: route MODEL through gemini-models module

No behavior change — per-topic editorial paragraphs stay on Flash.
Centralization only.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Smoke-test the Lite workloads against real claims

**Files:** none (output goes to terminal; no commit).

This task verifies the three Lite-bound workloads behave reasonably on a small sample before the change goes live. If the dev server is still running with old code, restart it first so it picks up the new imports.

- [ ] **Step 1: Restart the dev server so the new imports load**

If a dev server is running on localhost:3000, stop it and start it fresh:

```bash
cd "C:\Users\User\Desktop\ISR Politicians Fact Check\badak"
# Stop existing dev server (kill the npm/next process), then:
npm run dev
```

Wait until you see `✓ Ready in NNNms`.

- [ ] **Step 2: Run the editor on 20 recent live claims via the existing sweep script**

The sweep script (`scripts/apply-editorial-review.mts`) already accepts `--limit`. Run it in dry-run mode (no `--apply`):

```bash
npx tsx scripts/apply-editorial-review.mts --limit 20
```

Expected: the script prints each claim it considered, its decision (approved / rejected), and reason. Watch for two failure modes:
- Empty responses from Gemini (would show as "Editorial review failed" log lines). If > 2 of 20, prompt may need tuning for Lite.
- Schema mismatches (also "Editorial review failed"). Same threshold.

Approval rate should land roughly 85-95% — broadly similar to historical Flash sweeps. Anything outside ±10% of historical baseline is a quality signal worth pausing on.

- [ ] **Step 3: Spot-check a manual verifier call**

Pick one claim id from Step 2's output. Construct a small Node-tsx one-liner to call `verifyClaim` directly on its fields:

```bash
cd "C:\Users\User\Desktop\ISR Politicians Fact Check\badak"
cat > scripts/_smoke-verifier-tmp.mts << 'EOF'
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;
const key = env.match(/^GEMINI_API_KEY=(.*)$/m)?.[1]?.trim();
if (key) process.env.GEMINI_API_KEY = key;
const { PrismaClient } = await import("@prisma/client");
const { verifyClaim } = await import("../src/lib/verify-claim");
const p = new PrismaClient();
const c = await p.claim.findFirst({
  where: { status: "published", editorApproved: true },
  orderBy: { createdAt: "desc" },
  include: { politician: { select: { name: true } } },
});
if (!c) { console.log("no claim"); process.exit(0); }
console.log("Claim:", c.quote.slice(0, 80));
const v = await verifyClaim({
  quote: c.quote,
  verdict: c.verdict as "true" | "half-true" | "false",
  summary: c.summary,
  explanation: c.explanation,
  source: c.source,
  factSource: c.factSource,
  politicianName: c.politician.name,
  topic: c.topic,
  claimDate: c.date,
});
console.log("Lite verifier:", v);
await p.$disconnect();
EOF
npx tsx scripts/_smoke-verifier-tmp.mts
```

Expected: a `{ approved, confidence, issues }` object. `approved` is a boolean. `issues` is an array (empty if approved).

Failure modes:
- Throws: probably means the SDK call path is broken or Lite has a different response shape. Surface the error.
- Returns `confidence: 0` and `issues: ["שגיאה בתהליך האימות"]`: Lite hit a JSON parse error. May need prompt tweak.

Delete the temp file before moving on:

```bash
rm scripts/_smoke-verifier-tmp.mts
```

- [ ] **Step 4: Report findings**

If both checks look healthy, proceed to Task 9.

If quality looks degraded (high editor failure count, or verifier producing surprising verdicts on familiar claims), STOP and report. Recovery: set `BADAK_LITE_MODEL=gemini-2.5-flash` in `.env.local`, restart dev server, both workloads revert to Flash without code changes. Discuss with the user before proceeding.

---

## Task 9: Memory updates

**Files:** outside repo, no commits.

- `C:\Users\User\.claude\projects\C--Users-User-Desktop-ISR-Politicians-Fact-Check\memory\claude_pricing_constraint.md`
- `C:\Users\User\.claude\projects\C--Users-User-Desktop-ISR-Politicians-Fact-Check\memory\cost_realities.md`
- `C:\Users\User\.claude\projects\C--Users-User-Desktop-ISR-Politicians-Fact-Check\memory\quality_gate_triple_defense.md`

- [ ] **Step 1: Update `claude_pricing_constraint.md`**

Add this section at the bottom (it's about Anthropic pricing, but the Gemini quota lesson is structurally similar):

```markdown
## Pattern: split AI workloads across a provider's models

The same "shared daily quota gets exhausted by a sweep day" failure
mode that motivates this memory's main warning (don't migrate
fact-check to Claude) also bit us on Gemini, 2026-05-27. The fix
(`src/lib/gemini-models.ts`, spec at
`docs/superpowers/specs/2026-05-27-split-models-by-workload-design.md`):
verifier + editor + report-recommendation moved to
gemini-2.5-flash-lite (separate daily quota); extraction +
grounded fact-check + editorial synthesis stayed on gemini-2.5-flash.

Lesson: any provider with per-model quotas can be defused by
splitting structured-classification workloads onto a smaller model
within the same provider. Cheaper, separate quota pool, ~95% quality
on classification tasks. Avoid the cost of cross-provider migration
when this works.

Env override: `BADAK_LITE_MODEL=gemini-2.5-flash` reverts Lite-bound
workloads back to Flash if Lite quality regresses.
```

- [ ] **Step 2: Update `cost_realities.md`**

Find the per-call cost section and append:

```markdown
**Updated 2026-05-27 — Lite/Flash split:** Verifier, editor, and
report-recommendation now run on `gemini-2.5-flash-lite` (~$0.10/Mtok
input vs Flash's ~$0.30/Mtok). Per-call cost on those workloads drops
~3x. Steady-state savings are ~$0.50-1.50/day. The main benefit is
quota resilience, not cost; sweep days on the editor no longer take
down the production fact-check quota.
```

- [ ] **Step 3: Update `quality_gate_triple_defense.md`**

Find the table or section describing each layer's model. Add a note that as of 2026-05-27 the verifier (Layer 2) and editor (Layer 3) run on `gemini-2.5-flash-lite`. Important for anyone debugging quality regressions later — they need to know which model produced the bad decision before they go tuning the prompt.

Suggested wording:

```markdown
**Model assignment (as of 2026-05-27):**
- Layer 1 (claim-quality regex): deterministic, no model
- Layer 2 (verifier): `gemini-2.5-flash-lite`
- Layer 3 (editor): `gemini-2.5-flash-lite`
- Sweeps (`sweep-news-narrative.mts`, `apply-editorial-review.mts`):
  inherit each layer's model
- Grounded fact-check + extraction (upstream of these layers): stay on
  `gemini-2.5-flash`

If you find a verdict that looks like a model-capability issue rather
than a prompt issue, the env override `BADAK_LITE_MODEL=gemini-2.5-flash`
reverts the Lite layers back to Flash without code changes.
```

- [ ] **Step 4: No commit**

Memory lives outside the repo. Nothing to commit.

---

## Task 10: Final verification + push readiness

- [ ] **Step 1: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Tally commits**

```bash
cd "C:\Users\User\Desktop\ISR Politicians Fact Check\badak"
git log --oneline origin/master..HEAD
```

Expected: 7 commits from this plan (Task 1 + Tasks 2-7 = 7 commits). Task 8 is a smoke-test (no commit). Task 9 is memory (no commit).

- [ ] **Step 3: Verify the env override works manually (optional but recommended)**

Confirm the safety hatch works:

```bash
cd "C:\Users\User\Desktop\ISR Politicians Fact Check\badak"
cat > scripts/_smoke-env-override-tmp.mts << 'EOF'
process.env.BADAK_LITE_MODEL = "gemini-2.5-flash";
const m = await import("../src/lib/gemini-models");
console.log("MODEL_LITE with override:", m.MODEL_LITE);
console.log("MODEL_FLASH:", m.MODEL_FLASH);
EOF
npx tsx scripts/_smoke-env-override-tmp.mts
rm scripts/_smoke-env-override-tmp.mts
```

Expected:
```
MODEL_LITE with override: gemini-2.5-flash
MODEL_FLASH: gemini-2.5-flash
```

Confirms the env override path is wired correctly.

- [ ] **Step 4: Don't push.** Standing rule. Wait for the user to say "push".

---

## Self-Review

**Spec coverage:**
- New `gemini-models.ts` module → Task 1 ✓
- Verifier moved to Lite → Task 2 ✓
- Editor moved to Lite → Task 3 ✓
- Report recommendation moved to Lite → Task 4 ✓
- Extraction / fact-check / digest / topic-insights routed through Flash constant → Tasks 5, 6, 7 ✓
- Env override `BADAK_LITE_MODEL` → Task 1 ✓; verification in Task 10 ✓
- Verification approach (20-claim sample, watch dev server logs) → Task 8 ✓
- Memory updates → Task 9 ✓
- Out-of-scope items (cross-provider, pre-filter, quota dashboard, topic-insights-off-cron) → not in plan, as spec'd ✓

**Placeholder scan:** No TBDs, no "implement later", every code block is complete, every commit message spelled out.

**Type consistency:** `MODEL_FLASH` and `MODEL_LITE` are referenced identically across all 6 modules. The `as MODEL` alias pattern preserves every call site's existing `model: MODEL` reference, so no consumer needs further edits.

**Scope:** focused — one new file + six near-identical edits + smoke test + memory. Could trivially fit in one big commit but the per-module split makes it easy to bisect if any one workload regresses on Lite.
