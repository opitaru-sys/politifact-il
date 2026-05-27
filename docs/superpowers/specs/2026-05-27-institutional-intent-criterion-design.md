# Institutional-intent declarations: half-true with caveat

**Status:** approved 2026-05-27
**Originating feedback:** Dr. Tehila Shwartz Altshuler (Israel Democracy Institute), via email
**Owner:** Opitaru

## The problem

A claim on `israel-katz` was marked **true**: "מערכת הביטחון לא תקיים עם דן חלוץ כל קשר" ("the defense ministry will have no contact with Dan Halutz"). The verifier marked it true because Israel Katz did publicly declare this on May 15, 2026, and stood by it.

Tehila's point: the verdict is misleading. The verifier checked that the words were uttered, not whether the substantive claim ("the defense ministry will have no contact") is true or even legally possible. A public body in Israel cannot legally boycott a person based on past opinions, so the action declared can't actually happen as stated. By marking this "true", the site amplifies a contested intent as a verified fact.

This is adjacent to but distinct from existing verifier criterion #14 (characterization-as-fact):
- #14: politician characterizes someone else's past action ("X approved refusal"). Reject.
- This: politician declares their institution's future action against someone. Don't reject (it's newsworthy and the words were said), but don't mark "true" either.

## The rule

When the quote matches all of:
1. **Institutional voice** — first-person institutional ("we will", "the ministry will", "I'm instructing", "[ministry] will not")
2. **Future-tense action verb** against an external target — boycott, refuse, prevent, withhold, block, deny, sever, exclude
3. **Named specific target** — a person or organization, not a category

then the verdict should be **half-true** with an explanation that explicitly separates:
- ✓ what's verified: the politician made the declaration
- ✗ what's NOT verified: that the institution can or will actually carry it out

## Architecture

Three layers of defense, mirroring the existing quality-gate pattern:

### Layer 1 — Fact-check prompt (`src/lib/fact-check.ts`)
Add a new rule in the fact-check prompt: "If the quote is a politician declaring their institution will take a specific action against a named person/org, your verdict MUST be `half-true`. Explanation must say: the declaration was publicly made (verified), but the institution's legal authority and actual execution are not verified by this fact-check."

This catches the pattern at extraction time on new claims.

### Layer 2 — Verifier criterion #15 (`src/lib/verify-claim.ts`)
New criterion: "אם פסק הדין הוא 'אמת' אבל הציטוט הוא הצהרת כוונה מוסדית של פוליטיקאי נגד יעד מזוהה (חרם, סירוב קשר, מניעה, עיכוב מימון), דחה." On reject, the fact-check.ts post-processor downgrades verdict to half-true with caveat (new behavior — verifier currently only approves/rejects).

### Layer 3 — Editor category #11 (`src/lib/editorial-review.ts`)
Backup. Editor sees declarations of institutional intent marked "true" and flags for downgrade. Same conservative trigger as the verifier.

### Implementation note on the downgrade pattern
Today the verifier returns `{ approved, confidence, issues }` — boolean approval. To support downgrades without a schema change, we extend the `issues` semantics: when issues include the exact tag `[downgrade-to-half-true]`, `fact-check.ts` treats it as a signal to:
- Set `verdict: "half-true"`
- Prepend the fixed caveat to the explanation
- Mark `editorApproved: true` (override the reject so the claim stays live)
- Keep the issue note in `verifierNotes` for the corrections log

### The fixed caveat (Hebrew, prepended to explanation)
> **הצהרת כוונה מוסדית:** בדיקה זו מאמתת שהצהרה זו אכן נאמרה בפומבי על ידי הפוליטיקאי. היא **אינה** מאמתת האם המוסד שבראשו עומד הפוליטיקאי אכן יבצע את הפעולה המוצהרת, האם קיימת לו סמכות חוקית לעשות זאת, או שהפעולה הוכנסה לפועל בפועל.
>
> _[המשך ההסבר המקורי...]_

## Triage of the specific claim

`scripts/_fix-tehila-flagged-katz-halutz.mts`
- Locate the claim by needle (`מערכת הביטחון לא תקיים עם דן חלוץ`)
- `--apply`:
  - `verdict: "half-true"`
  - `explanation`: prepend a fixed Hebrew caveat that distinguishes "declaration was made" from "ministry will actually act"
  - `correctionNote`: cite Tehila's feedback explicitly, link to the principle

## Sweep for similar existing claims

`scripts/_sweep-institutional-intent.mts`
- Find live (`editorApproved=true`, `status=published`) claims where verdict=true and quote matches the conservative trigger pattern
- Pattern: regex over Hebrew action verbs (`לא יקיים`, `יחרים`, `נחרים`, `נמנע`, `יימנע`, `נסרב`, `יסרב`, `נחסום`, `יחסום`, `נחסיר`, `נימנע מלממן`) combined with proximity to an institutional voice marker
- Dry-run shows all matches with quote + current verdict + politician
- `--apply` downgrades to half-true with caveat + correctionNote
- Conservative — false positives stay live until manually reviewed

## Reply to Tehila (Hebrew, no em-dashes)

Structure:
1. Acknowledge specifically — yes, this is real, and you're right
2. What we fixed — the specific claim is corrected with a correction note
3. What we changed in the system — new criterion, sweep
4. Name the principle after the lesson she taught us
5. Thank her, invite continued feedback

## Memory updates

- New file `verdict_institutional_intent.md` documenting the criterion + the Tehila feedback as origin
- Update `quality_gate_triple_defense.md` to add verifier #15 / editor #11 / fact-check rule
- Update `corrections_log.md` if the sweep changes a meaningful number of claims (mention the count)

## Out of scope

- Doing actual legal analysis on each claim. We're not lawyers and the AI isn't trained on Israeli administrative law.
- Catching personal future commitments ("I will resign", "I will vote against"). Out of scope; the trigger explicitly requires institutional voice + named external target.
- Retroactively re-fact-checking sweep matches via Gemini. We're flipping the verdict deterministically with a fixed caveat, not re-asking the AI.

## Success criteria

- The flagged claim is downgraded to half-true with caveat and correction note ✓
- New criterion #15 lands in the verifier prompt and gets test coverage via dry-run
- Sweep finds and corrects at least the Katz/Halutz claim, and any similar pattern with high precision (low false positives on review)
- Tehila gets a substantive reply naming what we did
- Memory captures the principle so future criteria additions don't re-litigate
