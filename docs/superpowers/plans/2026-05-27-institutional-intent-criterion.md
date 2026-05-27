# Institutional-Intent Criterion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catch the failure mode Tehila flagged — claims marked "true" because the politician said the words, when the substance ("institution will take action X against person Y") is not actually verified. Downgrade to half-true with a fixed caveat that separates "declaration was made" from "outcome is verified."

**Architecture:** Three-layer defense (same pattern as existing quality gates). Fact-check prompt teaches the model to assign half-true at extraction time. Verifier criterion #15 catches misses and signals a downgrade via a novel `[downgrade-to-half-true]` tag in `issues`. Editor category #11 is the final backup. Existing claims get fixed via a triage script (for Tehila's specific report) plus a conservative sweep script (for similar patterns across the corpus).

**Tech Stack:** Next.js 16 / TypeScript / Prisma + Neon Postgres / Gemini 2.5 Flash (no test framework in this repo — verification is dry-run scripts + type-check + visual DB inspection).

**Repo conventions used by this plan:**
- Scripts in `scripts/` are `.mts` files prefixed with `_` if disposable (the underscore signals "feel free to delete later")
- Every DB-mutating script supports `--apply` (default = dry-run that prints what would happen)
- Existing scripts read `.env.local` directly to set `DATABASE_URL` and `GEMINI_API_KEY`; new scripts copy that pattern
- `npx tsc --noEmit` is the type-check command — should be clean before each commit
- Commits include `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer
- Memory files live OUTSIDE the repo at `C:\Users\User\.claude\projects\C--Users-User-Desktop-ISR-Politicians-Fact-Check\memory\` — they don't get committed

---

## File Structure

**Created:**
- `scripts/_fix-tehila-flagged-katz-halutz.mts` — disposable triage for the one claim Tehila reported
- `scripts/_sweep-institutional-intent.mts` — conservative sweep across live claims for similar patterns
- `src/lib/institutional-intent.ts` — shared constants: the trigger regex, the Hebrew caveat string, the downgrade tag, helpers
- `C:\Users\User\.claude\projects\C--Users-User-Desktop-ISR-Politicians-Fact-Check\memory\verdict_institutional_intent.md` — new memory file capturing the principle

**Modified:**
- `src/lib/fact-check.ts` — (a) inject institutional-intent rule into the extractor/fact-check prompt, (b) post-processor that handles `[downgrade-to-half-true]` tag from verifier
- `src/lib/verify-claim.ts` — add criterion #15 to the verifier prompt
- `src/lib/editorial-review.ts` — add category #11 to the editor prompt
- `C:\Users\User\.claude\projects\C--Users-User-Desktop-ISR-Politicians-Fact-Check\memory\quality_gate_triple_defense.md` — document verifier #15 + editor #11
- `C:\Users\User\.claude\projects\C--Users-User-Desktop-ISR-Politicians-Fact-Check\memory\MEMORY.md` — index the new memory file

**Why a shared `institutional-intent.ts`:** the trigger regex, the downgrade tag string, and the Hebrew caveat are used in (a) the fact-check post-processor, (b) the triage script, (c) the sweep script, and (d) the prompts (as documentation, not at runtime). One source of truth prevents drift — change the caveat in one place, every consumer picks it up.

---

## Task 1: Shared constants module

**Files:**
- Create: `src/lib/institutional-intent.ts`

- [ ] **Step 1: Create the module with regex + caveat + helper**

```typescript
/**
 * Shared constants + helpers for the "institutional-intent declaration"
 * verdict policy. See docs/superpowers/specs/2026-05-27-institutional-intent-criterion-design.md
 * for the principle and Dr. Tehila Shwartz Altshuler's originating feedback.
 *
 * Pattern: a politician declares their institution will take a specific
 * action (boycott / refuse / withhold / block) against a named target.
 * Verifying that the politician SAID it does not verify that the
 * institution will actually DO it. We downgrade these to half-true with
 * a fixed caveat.
 */

/** Tag the verifier emits in `issues` to signal a downgrade rather than a reject.
 *  fact-check.ts's post-processor picks this up and rewrites verdict + explanation. */
export const DOWNGRADE_TAG = "[downgrade-to-half-true]";

/** Prepended to the explanation when a claim is downgraded. The double newline
 *  separates the caveat from the original explanation. */
export const HEBREW_CAVEAT =
  "**הצהרת כוונה מוסדית:** בדיקה זו מאמתת שהצהרה זו אכן נאמרה בפומבי על ידי הפוליטיקאי. היא **אינה** מאמתת האם המוסד שבראשו עומד הפוליטיקאי אכן יבצע את הפעולה המוצהרת, האם קיימת לו סמכות חוקית לעשות זאת, או שהפעולה הוכנסה לפועל בפועל.";

/** Conservative regex for the sweep + triage scripts. Catches Hebrew
 *  institutional-action verbs in future-tense or imperative form combined
 *  with negation or refusal markers. Examples it should match:
 *    "מערכת הביטחון לא תקיים עם דן חלוץ כל קשר"
 *    "נחרים את עמותת X"
 *    "המשרד לא יקבל את Y"
 *    "אני מורה לצבא לא לעבוד עם Z"
 *  This is intentionally narrow — we'd rather miss some than down-grade
 *  legitimate factual claims. The verifier prompt catches the broader set. */
export const INSTITUTIONAL_INTENT_RE =
  /(?:לא ית?קיים|לא יקבל|לא תקבל|לא ימומן|לא תמומן|לא נעב(?:ו|ו)ד|לא יעב(?:ו|ו)ד|לא יסכים|לא תסכים|נחרים|יחרים|תחרים|נחסום|יחסום|תחסום|נסרב|יסרב|תסרב|אני מורה|הוריתי ל|אינסטרוקציה|נמנע מ|תימנע מ)\b/;

/**
 * Apply the downgrade: rewrite the verdict to "half-true", prepend the
 * caveat to the explanation if not already present, and append the
 * downgrade tag to the notes if not already present.
 *
 * Idempotent — running it twice on the same claim is a no-op.
 */
export function applyDowngrade(input: {
  verdict: string;
  explanation: string;
  notes: string[];
}): { verdict: "half-true"; explanation: string; notes: string[] } {
  const hasCaveat = input.explanation.startsWith(HEBREW_CAVEAT);
  const explanation = hasCaveat
    ? input.explanation
    : `${HEBREW_CAVEAT}\n\n${input.explanation}`;
  const hasTag = input.notes.some((n) => n.includes(DOWNGRADE_TAG));
  const notes = hasTag ? input.notes : [...input.notes, DOWNGRADE_TAG];
  return { verdict: "half-true", explanation, notes };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean (or only pre-existing errors unrelated to this file)

- [ ] **Step 3: Commit**

```bash
git add src/lib/institutional-intent.ts
git commit -m "$(cat <<'EOF'
Institutional-intent: shared constants + downgrade helper

Per spec docs/superpowers/specs/2026-05-27-institutional-intent-criterion-design.md.
Single source of truth for the downgrade tag, the Hebrew caveat, and
the conservative trigger regex. fact-check.ts post-processor, triage
script, and sweep script all import from here so the caveat text +
trigger pattern can't drift.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Triage Tehila's flagged claim

**Files:**
- Create: `scripts/_fix-tehila-flagged-katz-halutz.mts`

- [ ] **Step 1: Write the script**

```typescript
#!/usr/bin/env tsx
/** Tehila Shwartz Altshuler flagged a Katz/Halutz claim where the verdict
 *  was true because Katz publicly declared "the defense ministry will have
 *  no contact with Dan Halutz" — but the substantive claim (ministry will
 *  actually do this) isn't verified, and may not even be legally possible.
 *
 *  Downgrade the verdict to half-true with the institutional-intent caveat
 *  + record the correction note explicitly crediting her feedback. */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;
const { PrismaClient } = await import("@prisma/client");
const { applyDowngrade } = await import("../src/lib/institutional-intent");
const p = new PrismaClient();

const APPLY = process.argv.includes("--apply");

const matches = await p.claim.findMany({
  where: {
    politicianId: "israel-katz",
    quote: { contains: "מערכת הביטחון לא תקיים עם דן חלוץ" },
  },
  select: {
    id: true,
    verdict: true,
    quote: true,
    explanation: true,
    verifierNotes: true,
    editorApproved: true,
  },
});

console.log(`Found ${matches.length} match(es) for Tehila's flagged claim`);
for (const c of matches) {
  console.log(`  ${c.id}  verdict=${c.verdict}  approved=${c.editorApproved}`);
  console.log(`    quote: ${c.quote.slice(0, 120)}`);

  if (c.verdict !== "true") {
    console.log(`    SKIP: already not "true" — leaving alone`);
    continue;
  }

  const notes = c.verifierNotes ? c.verifierNotes.split("; ") : [];
  const next = applyDowngrade({
    verdict: c.verdict,
    explanation: c.explanation,
    notes,
  });

  console.log(`    → verdict half-true, explanation prepended with caveat`);

  if (APPLY) {
    await p.claim.update({
      where: { id: c.id },
      data: {
        verdict: next.verdict,
        explanation: next.explanation,
        verifierNotes: next.notes.join("; "),
        editorApproved: true,
        correctionNote:
          'בעקבות משוב מד"ר תהילה שוורץ אלטשולר (המכון הישראלי לדמוקרטיה): פסק הדין שונה מ"אמת" ל"חצי-אמת" עם הסתייגות מפורשת — האמירה אכן נאמרה בפומבי, אך אין אימות לכך שמערכת הביטחון אכן תבצע את ההחרמה או שיש לה סמכות חוקית לעשות זאת. עיינו ב"הצהרת כוונה מוסדית" בתחילת ההסבר.',
        correctedAt: new Date(),
      },
    });
    console.log(`    ✓ updated`);
  }
}

if (!APPLY) console.log("\nDry run. --apply to commit.");
await p.$disconnect();
```

- [ ] **Step 2: Dry-run to confirm match + preview**

Run: `npx tsx scripts/_fix-tehila-flagged-katz-halutz.mts`
Expected: 1 match found, prints id + current verdict (true) + the planned change. No DB write.

- [ ] **Step 3: Apply**

Run: `npx tsx scripts/_fix-tehila-flagged-katz-halutz.mts --apply`
Expected: "✓ updated" line.

- [ ] **Step 4: Verify in DB**

Run: `npx tsx -e "import { readFileSync } from 'fs'; const env = readFileSync('.env.local', 'utf8'); const url = env.match(/^DATABASE_URL=(.*)\$/m)?.[1]?.trim(); if (url) process.env.DATABASE_URL = url; const { PrismaClient } = await import('@prisma/client'); const p = new PrismaClient(); const c = await p.claim.findFirst({ where: { politicianId: 'israel-katz', quote: { contains: 'מערכת הביטחון לא תקיים עם דן חלוץ' } } }); console.log('verdict:', c?.verdict); console.log('explanation head:', c?.explanation.slice(0, 200)); console.log('correctionNote head:', c?.correctionNote?.slice(0, 100)); await p.\$disconnect();"`
Expected: `verdict: half-true`, explanation starts with `**הצהרת כוונה מוסדית:**`, correctionNote mentions תהילה שוורץ.

- [ ] **Step 5: Commit**

```bash
git add scripts/_fix-tehila-flagged-katz-halutz.mts
git commit -m "$(cat <<'EOF'
Triage: downgrade Tehila's flagged Katz/Halutz claim to half-true

Per feedback from Dr. Tehila Shwartz Altshuler. The verdict was true
because Katz publicly declared "the defense ministry will have no
contact with Dan Halutz", but the substantive claim (ministry will
actually do this) wasn't verified and may not even be legally possible.

Downgrade to half-true with the institutional-intent caveat prepended
to the explanation, plus a correctionNote crediting the feedback.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Verifier criterion #15

**Files:**
- Modify: `src/lib/verify-claim.ts` (insert criterion #15 after #14)

- [ ] **Step 1: Read the file to locate the right insertion point**

Run: `npx grep -n "14\." src/lib/verify-claim.ts` (or use the Grep tool with `pattern="14\.\s\*\*"`, `output_mode="content"`, `-n=true`).

Find the line where criterion #14 ends and the **אישור:** ("Approval") section begins. The new #15 goes between them.

- [ ] **Step 2: Insert criterion #15 immediately before the `**אישור:**` line**

```
15. **הצהרת כוונה מוסדית — הפוליטיקאי מצהיר שמוסד שבראשו הוא עומד יבצע פעולה ספציפית נגד אדם או ארגון מזוהה** — דגל קריטי, אבל **לא דחייה רגילה**. במקרה כזה, הוסף ל-issues את התג המדויק `[downgrade-to-half-true]`, וצור הסבר ב-issues שמסביר מה התגלה. הצינור יסמן את הטענה כ"חצי-אמת" עם הסתייגות סטנדרטית במקום לפסול אותה.

   **תנאים חייבים להתקיים יחד:**
   - (א) הציטוט בקול מוסדי — פתיחה בגוף ראשון מוסדי או שם של מוסד ("מערכת הביטחון", "המשרד", "אני מורה ל...", "נחרים", "לא ניתן ל...").
   - (ב) פועל בזמן עתיד או ציווי שמבטא פעולה נגד יעד — "יחרים", "לא יקיים קשר עם", "לא יקבל", "ימנע מ", "יסרב", "יחסום", "ינתק קשר עם".
   - (ג) יעד מזוהה ספציפי — שם פרטי של אדם, ארגון, או עמותה. לא קטגוריה כללית ("המחבלים", "ארגוני טרור").
   - (ד) הפסק הנוכחי הוא "אמת".

   **דוגמאות שצריך לסמן:**
   - "מערכת הביטחון לא תקיים עם דן חלוץ כל קשר" — מוסדי + פעולה עתידית + יעד מזוהה. ✓
   - "אני מורה ל[משרד] לא לממן יותר את [עמותה X]" — מוסדי + פעולה עתידית + יעד. ✓
   - "המשטרה לא תיתן ליגאל לוי לדבר באירוע" — מוסדי + פעולה עתידית + יעד. ✓

   **דוגמאות שאינן מתאימות:**
   - "אני לא אפגש עם X" — אישי, לא מוסדי. דלג.
   - "ישראל לא תנהל מגעים עם איראן" — מוסדי + פעולה, אבל איראן היא קטגוריה מדינית רחבה, לא יעד מזוהה. דלג.
   - "המשרד יפעל לקדם את הצעת החוק" — חיובי/פרוצדורלי, לא נגד יעד. דלג.
   - הפסק כבר "חצי-אמת" או "שקר" — דלג, אין מה לדגרד.

   **למה לא לפסול:** הציבור צריך לראות שההצהרה נאמרה — היא חדשותית. הבעיה היא רק שפסק "אמת" משדר שהמוסד אכן יבצע את הפעולה, וזה לא נבדק. "חצי-אמת" עם הסתייגות מתעד גם את ההצהרה וגם את חוסר האימות.

   **מה לכתוב ב-issues:** את התג המדויק `[downgrade-to-half-true]` כפריט אחד (בדיוק כך, כולל הסוגריים), ופריט שני קצר בעברית שמסביר: "הצהרת כוונה מוסדית של [פוליטיקאי] נגד [יעד] — אומת שנאמרה, לא אומת שהמוסד יבצע".
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/verify-claim.ts
git commit -m "$(cat <<'EOF'
Verifier criterion #15: institutional-intent downgrade signal

Per Tehila's feedback. When a politician declares their institution
will take action against a named target and the current verdict is
"true", verifier emits the [downgrade-to-half-true] tag in issues.
fact-check.ts post-processor (next commit) picks this up and rewrites
verdict + explanation rather than rejecting.

Novel pattern in the verifier: previously it only had approve/reject
power. The tag is a third option — keep the claim live but at a more
honest verdict level.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Fact-check post-processor for the downgrade tag

**Files:**
- Modify: `src/lib/fact-check.ts` (the block that processes verifier output, around line 660 — search for `verification.approved` to locate it)

- [ ] **Step 1: Read the current block**

Run: `npx grep -n "verification.approved" src/lib/fact-check.ts -A 30` (use Grep tool with `output_mode="content"`, `-A=30`).

The block looks roughly like:
```typescript
let finalApproved = verification.approved;
const notes: string[] = verification.issues.slice();
if (verification.approved && process.env.BADAK_DISABLE_EDITOR !== "1") {
  try {
    const editorial = await editorialReview({ ... });
    if (!editorial.approved) {
      finalApproved = false;
      notes.unshift(`[עורך] ${editorial.reason}`);
    }
  } catch (err) { ... }
}

await prisma.claim.update({
  where: { id: saved.id },
  data: {
    editorApproved: finalApproved,
    verifiedAt: new Date(),
    verifierNotes: notes.length ? notes.join("; ") : null,
  },
});
```

- [ ] **Step 2: Add the import at the top of the file**

In the imports section near the top:

```typescript
import { applyDowngrade, DOWNGRADE_TAG } from "./institutional-intent";
```

- [ ] **Step 3: Insert the downgrade post-processor**

Right after the verifier call and BEFORE the `if (verification.approved && ...)` block that runs the editor, add:

```typescript
        // Institutional-intent downgrade: if the verifier emitted the
        // [downgrade-to-half-true] tag in issues, rewrite the verdict
        // and explanation in-place rather than rejecting. The claim
        // stays live (editorApproved=true) but the verdict reflects
        // that we only verified the declaration, not the outcome.
        // See src/lib/institutional-intent.ts.
        let postVerdict = saved.verdict;
        let postExplanation = saved.explanation;
        const downgradeRequested = verification.issues.some((i) =>
          i.includes(DOWNGRADE_TAG),
        );
        if (downgradeRequested && saved.verdict === "true") {
          const downgrade = applyDowngrade({
            verdict: saved.verdict,
            explanation: saved.explanation,
            notes: verification.issues,
          });
          postVerdict = downgrade.verdict;
          postExplanation = downgrade.explanation;
          // Override: treat verifier as approving (we're keeping the claim,
          // just at a more conservative verdict).
          verification.approved = true;
        }
```

- [ ] **Step 4: Use postVerdict + postExplanation in the prisma update**

Replace the existing `prisma.claim.update({ data: { editorApproved: finalApproved, ... } })` block to also write `verdict: postVerdict` and `explanation: postExplanation` when they changed:

```typescript
        await prisma.claim.update({
          where: { id: saved.id },
          data: {
            editorApproved: finalApproved,
            verifiedAt: new Date(),
            verifierNotes: notes.length ? notes.join("; ") : null,
            // Only write verdict + explanation back if the downgrade
            // changed them. Saves a column-write on the happy path.
            ...(postVerdict !== saved.verdict && { verdict: postVerdict }),
            ...(postExplanation !== saved.explanation && { explanation: postExplanation }),
          },
        });
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Smoke-test (no DB writes)**

Construct a synthetic fact-check + verifier output that includes the tag, and confirm the post-processor would rewrite correctly. Quick way:

Run: `npx tsx -e "import { applyDowngrade, DOWNGRADE_TAG } from './src/lib/institutional-intent'; const out = applyDowngrade({ verdict: 'true', explanation: 'Katz declared X on Y.', notes: [DOWNGRADE_TAG] }); console.log(out);"`
Expected: `{ verdict: 'half-true', explanation: '**הצהרת כוונה מוסדית:**...\n\nKatz declared X on Y.', notes: ['[downgrade-to-half-true]'] }`

- [ ] **Step 7: Commit**

```bash
git add src/lib/fact-check.ts
git commit -m "$(cat <<'EOF'
fact-check: post-process verifier's [downgrade-to-half-true] tag

When the verifier signals an institutional-intent downgrade (criterion #15),
rewrite the saved claim's verdict to half-true and prepend the Hebrew
caveat to the explanation. The claim stays live with editorApproved=true —
verifier's reject is overridden because the goal is downgrade-not-block.

The conditional spread on the prisma update means we only touch the
verdict/explanation columns on the rare downgrade path, not on every
claim update.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Add the prompt rule to the fact-check (extraction-time guard)

**Files:**
- Modify: `src/lib/fact-check.ts` (the fact-check prompt block — search for `factCheckClaim` or `factCheckPrompt`)

- [ ] **Step 1: Locate the fact-check prompt**

Run: Grep for `factCheckClaim` definition and find the prompt template that gets sent to Gemini.

- [ ] **Step 2: Add a new rule to the prompt**

Find the section that explains verdict assignment rules (true / half-true / false). Add this rule near where existing constraints on verdict assignment live:

```
**הצהרת כוונה מוסדית = חצי-אמת:** אם הציטוט הוא פוליטיקאי המצהיר שמוסד שבראשו הוא עומד יבצע פעולה ספציפית נגד אדם או ארגון מזוהה (חרם, סירוב קשר, מניעה, ניתוק תקציב), פסק הדין חייב להיות "חצי-אמת" גם אם הציטוט אכן נאמר. הסיבה: בדיקה זו יכולה לאמת שההצהרה נאמרה בפומבי, אבל אינה יכולה לאמת שהמוסד אכן יבצע את הפעולה או שיש לו סמכות חוקית לעשות זאת. ההסבר חייב להתייחס לשני הצדדים: (1) האם ההצהרה אכן נאמרה (כן/לא, מקור), ו-(2) הפעולה המוצהרת לא אומתה — לא בוצעה / סמכות חוקית בלתי ברורה / טרם דווח על יישום.
דוגמאות:
- "מערכת הביטחון לא תקיים עם X כל קשר" — חצי-אמת אם נאמר.
- "המשרד יפסיק לממן עמותת Y" — חצי-אמת אם נאמר.
- "אני מורה לצבא לא לעבוד עם Z" — חצי-אמת אם נאמר.
דלג על הכלל הזה אם: הציטוט מתאר כוונה אישית ("אני לא אפגש"), פעולה כללית ("ישראל לא תנהל"), או פעולה חיובית/פרוצדורלית ("המשרד יפעל לקדם").
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/fact-check.ts
git commit -m "$(cat <<'EOF'
fact-check prompt: institutional-intent declarations → half-true

Teaches the extractor/fact-check call that 'minister declares
ministry will [boycott/refuse/withhold] [named target]' must get
verdict half-true with explanation that separates 'declaration was
made' from 'action will actually happen'. First line of defense
before the verifier post-processor catches misses.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Editor category #11 (backup)

**Files:**
- Modify: `src/lib/editorial-review.ts`

- [ ] **Step 1: Read the editor prompt structure**

Run: `npx grep -n "10\." src/lib/editorial-review.ts -A 5` to locate category #10 and find where #11 should insert.

- [ ] **Step 2: Add category #11 right after #10 in the reject-list, and update the "in doubt" rule below**

After category #10 (characterization-as-fact, in the reject list), insert:

```
11. **הצהרת כוונה מוסדית — הפסק "אמת" לציטוט שבו פוליטיקאי מצהיר שמוסד שבראשו הוא עומד יבצע פעולה נגד יעד מזוהה** — דגל חשוב במיוחד. כמו #10 (טענה אפיונית), הציבור מקבל אישור "אמת" שמטעה — הוא חושב שהפעולה תתבצע, אך הבדיקה רק אישרה שהציטוט נאמר. דחה כאן (העורך אינו מנמיך פסק; אם הציטוט שורד את העורך, הצינור יסמן אותו דרך הוורפייר ב-#15). דחה אם:
   - הציטוט בקול מוסדי + פועל עתיד נגד יעד מזוהה + פסק "אמת".
   - לא נמצא בהסבר אימות של ביצוע בפועל או של סמכות חוקית.
   דוגמאות לדחייה:
   - "מערכת הביטחון לא תקיים עם דן חלוץ כל קשר" עם פסק "אמת". **דחה.**
   - "המשרד לא ימשיך לממן עמותת X" עם פסק "אמת". **דחה.**
   - "אני מורה לצבא לא לעבוד עם Y" עם פסק "אמת". **דחה.**
   הבחנה: אם הפסק הוא כבר "חצי-אמת" עם הסתייגות — אישור, הצינור כבר טיפל.
```

Then update the "in doubt" instruction. Find the existing line that lists categories 9-10 ("בספק לגבי קטגוריות 9-10 ... דחה.") and update it to include #11:

```
- בספק לגבי קטגוריות 9-11 (שיפוט retroactive / טענה אפיונית / הצהרת כוונה מוסדית): **דחה.**
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/editorial-review.ts
git commit -m "$(cat <<'EOF'
Editor category #11: reject 'true' verdicts on institutional-intent

Backup safety net for verifier criterion #15. The editor can only
reject (not downgrade), so if a 'true' verdict on an institutional-
intent declaration reaches the editor, we reject it and the verifier
re-runs (which now has #15 and the downgrade tag wired up).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Conservative sweep for similar existing claims

**Files:**
- Create: `scripts/_sweep-institutional-intent.mts`

- [ ] **Step 1: Write the script**

```typescript
#!/usr/bin/env tsx
/** Sweep live (editorApproved=true, status=published) claims with verdict=true
 *  whose quote matches the conservative institutional-intent regex. Downgrade
 *  matches to half-true with the standard caveat + correctionNote.
 *
 *  Intentionally narrow — false negatives over false positives. Run dry first;
 *  hand-spot-check the list before --apply. */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;
const { PrismaClient } = await import("@prisma/client");
const { applyDowngrade, INSTITUTIONAL_INTENT_RE } = await import(
  "../src/lib/institutional-intent"
);
const p = new PrismaClient();

const APPLY = process.argv.includes("--apply");

const rows = await p.claim.findMany({
  where: { editorApproved: true, status: "published", verdict: "true" },
  select: {
    id: true,
    quote: true,
    explanation: true,
    verifierNotes: true,
    politicianId: true,
    politician: { select: { name: true } },
    correctionNote: true,
  },
});

console.log(`Scanning ${rows.length} live verdict=true claims...`);

const matches = rows.filter((r) => INSTITUTIONAL_INTENT_RE.test(r.quote));
console.log(`${matches.length} match the institutional-intent pattern.\n`);

for (const c of matches) {
  console.log(`--- ${c.politician.name} (${c.id}) ---`);
  console.log(`  quote: ${c.quote.slice(0, 140)}`);
  if (c.correctionNote) {
    console.log(`  SKIP: already has correctionNote — leaving alone`);
    continue;
  }

  const notes = c.verifierNotes ? c.verifierNotes.split("; ") : [];
  const next = applyDowngrade({
    verdict: "true",
    explanation: c.explanation,
    notes,
  });

  if (APPLY) {
    await p.claim.update({
      where: { id: c.id },
      data: {
        verdict: next.verdict,
        explanation: next.explanation,
        verifierNotes: next.notes.join("; "),
        correctionNote:
          "פסק הדין שונה מ'אמת' ל'חצי-אמת' לאחר עדכון כללי האימות: הצהרת כוונה מוסדית נגד יעד מזוהה אומתה כי נאמרה, אך ביצוע בפועל וסמכות חוקית לא נבדקו. עיינו ב'הצהרת כוונה מוסדית' בתחילת ההסבר.",
        correctedAt: new Date(),
      },
    });
    console.log(`  ✓ downgraded`);
  } else {
    console.log(`  would downgrade to half-true + add caveat`);
  }
}

console.log(`\n${matches.length} candidate(s), ${matches.filter((c) => !c.correctionNote).length} actionable.`);
if (!APPLY) console.log("Dry run. --apply to commit.");
await p.$disconnect();
```

- [ ] **Step 2: Dry-run to see matches**

Run: `npx tsx scripts/_sweep-institutional-intent.mts`
Expected: list of matches. Read each one and confirm it's a real institutional-intent claim, not a false positive. **STOP HERE if the false-positive rate is high — tighten the regex in `src/lib/institutional-intent.ts` first.**

- [ ] **Step 3: Apply**

Run: `npx tsx scripts/_sweep-institutional-intent.mts --apply`
Expected: each match prints "✓ downgraded".

- [ ] **Step 4: Spot-check one downgraded row in DB**

Pick one id from the apply output and verify the verdict + explanation:

Run: `npx tsx -e "import { readFileSync } from 'fs'; const env = readFileSync('.env.local', 'utf8'); const url = env.match(/^DATABASE_URL=(.*)\$/m)?.[1]?.trim(); if (url) process.env.DATABASE_URL = url; const { PrismaClient } = await import('@prisma/client'); const p = new PrismaClient(); const c = await p.claim.findUnique({ where: { id: 'PASTE_ID_HERE' } }); console.log('verdict:', c?.verdict); console.log('explanation head:', c?.explanation.slice(0, 200)); console.log('correctionNote:', c?.correctionNote); await p.\$disconnect();"`
Expected: verdict = half-true, explanation starts with the caveat, correctionNote populated.

- [ ] **Step 5: Commit**

```bash
git add scripts/_sweep-institutional-intent.mts
git commit -m "$(cat <<'EOF'
Sweep: downgrade existing institutional-intent claims to half-true

Conservative pattern match across live verdict=true claims. Each
match downgrades verdict → half-true, prepends the standard Hebrew
caveat to explanation, writes a correctionNote so /corrections
surfaces the change. Skips claims that already have a correctionNote
(idempotent re-runs).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Memory updates

**Files:**
- Create: `C:\Users\User\.claude\projects\C--Users-User-Desktop-ISR-Politicians-Fact-Check\memory\verdict_institutional_intent.md`
- Modify: `C:\Users\User\.claude\projects\C--Users-User-Desktop-ISR-Politicians-Fact-Check\memory\quality_gate_triple_defense.md`
- Modify: `C:\Users\User\.claude\projects\C--Users-User-Desktop-ISR-Politicians-Fact-Check\memory\MEMORY.md`

These files live OUTSIDE the repo — no commit needed.

- [ ] **Step 1: Create `verdict_institutional_intent.md`**

```markdown
---
name: verdict-institutional-intent
description: "Verdict policy for 'minister declares institution will act against named target' claims. Half-true with fixed Hebrew caveat, not true. Originated from Tehila Shwartz Altshuler's feedback 2026-05-27."
metadata:
  node_type: memory
  type: project
  originSessionId: 58a23120-1c79-4cef-9368-78ec5cc0e168
---

## The principle

When a politician declares that an institution they head will take a specific action against a named target (boycott, refuse contact, withhold funding, prevent appointment), the verdict is **half-true with a fixed caveat**, not true.

Why: marking "true" tells readers the institution will actually do the thing. The fact-check only verified the declaration was made — not that the institution legally can or actually will carry it out. Israeli public bodies have constraints (administrative law, due process, separation of powers) that mean a minister saying "the ministry will boycott X" is not the same as the ministry actually boycotting X.

## Origin

Dr. Tehila Shwartz Altshuler (Israel Democracy Institute), via email feedback on 2026-05-27, flagged the Israel Katz / Dan Halutz "no contact" claim. Her exact wording: "מערכת הביטחון בהיותה גוף ציבורי, לא יכולה להחרים אף אחד, גם אם שר הביטחון ממש רוצה בכך... אתה מסמן אותו כנכון רק מפני שנאמר בעבר."

## Three-layer defense

| Layer | What | Where |
|---|---|---|
| Fact-check prompt | Tells the model at extraction time: institutional-intent → half-true | `src/lib/fact-check.ts` (fact-check prompt block) |
| Verifier criterion #15 | Catches misses. Emits `[downgrade-to-half-true]` tag in issues. fact-check.ts post-processor reads the tag and rewrites verdict + explanation. | `src/lib/verify-claim.ts` |
| Editor category #11 | Final backup. Editor rejects (it can't downgrade), verifier re-runs | `src/lib/editorial-review.ts` |

Shared constants (the tag string, the caveat, the regex): `src/lib/institutional-intent.ts`.

## What the caveat says (Hebrew)

> **הצהרת כוונה מוסדית:** בדיקה זו מאמתת שהצהרה זו אכן נאמרה בפומבי על ידי הפוליטיקאי. היא **אינה** מאמתת האם המוסד שבראשו עומד הפוליטיקאי אכן יבצע את הפעולה המוצהרת, האם קיימת לו סמכות חוקית לעשות זאת, או שהפעולה הוכנסה לפועל בפועל.

Prepended to the explanation. The original explanation body follows after a blank line.

## When the rule DOESN'T apply

- Personal action ("I will not meet with X"). Out of scope.
- Action against a category, not a named target ("Israel will not negotiate with terrorist organizations"). Out of scope.
- Positive / procedural ("the ministry will publish the report"). Out of scope.
- Verdict already half-true or false. Out of scope — the rule only downgrades from true.

## Don't re-litigate

- We don't do real legal analysis. We just refuse to mark these "true."
- We don't reject these as "not a real claim" — they're newsworthy declarations and the public should see them, just at an honest verdict.
- The verifier emitting `[downgrade-to-half-true]` is a NOVEL output pattern. Don't try to "clean it up" by removing the tag without understanding why fact-check.ts post-processes it.
- The regex in `institutional-intent.ts` is intentionally narrow. Don't broaden without doing a fresh sweep and counting false positives first.

## Scripts

- `scripts/_fix-tehila-flagged-katz-halutz.mts` — disposable; the specific Tehila triage. Already ran.
- `scripts/_sweep-institutional-intent.mts` — conservative sweep across live claims. Re-run after corpus changes or if the regex tightens.
```

- [ ] **Step 2: Append to `quality_gate_triple_defense.md`**

Add to the verifier criteria list at the bottom (after #14):

```
- **#15: institutional-intent downgrade** (added 2026-05-27 from Tehila Shwartz Altshuler feedback) — verifier emits `[downgrade-to-half-true]` tag when a politician declares their institution will act against a named target and current verdict is "true". fact-check.ts post-processor rewrites verdict to half-true with Hebrew caveat. Novel output pattern; see `verdict_institutional_intent.md`.
```

And to the editor categories section, add `#11`:

```
- **#11: institutional-intent reject** (added 2026-05-27) — backup for verifier #15. If a "true" verdict on an institutional-intent declaration reaches the editor, reject so the verifier re-runs.
```

- [ ] **Step 3: Update `MEMORY.md` index**

In the "Highest priority" section, add a line after the quality-gate-triple-defense line:

```
- [Verdict policy: institutional intent](verdict_institutional_intent.md) — "minister declares ministry will act against X" → half-true with caveat, not true (Tehila Shwartz Altshuler feedback 2026-05-27)
```

- [ ] **Step 4: No commit (memory lives outside repo)**

Verify the files exist:

Run: `ls "C:\Users\User\.claude\projects\C--Users-User-Desktop-ISR-Politicians-Fact-Check\memory\verdict_institutional_intent.md"`
Expected: file exists.

---

## Task 9: Draft the reply to Tehila

**Files:** none (output goes in chat for user to copy)

- [ ] **Step 1: Compose the Hebrew reply**

Plain text, no em-dashes, no markdown. Structure: acknowledge → fix → system change → thank → invite.

Output to chat:

```
תהילה היקרה,

תודה רבה על המשוב המדוקדק. הצדק איתך לגמרי.

הציטוט הספציפי שציינת כבר עודכן. פסק הדין שונה מ"אמת" ל"חצי-אמת", וההסבר נפתח עכשיו בהסתייגות מפורשת שמבדילה בין מה שכן נבדק (האם ההצהרה אכן נאמרה) לבין מה שלא נבדק (האם מערכת הביטחון אכן תבצע את ההחרמה, ואם בכלל יש לה סמכות חוקית לעשות זאת). הוספתי גם רשומת תיקון שמקדישה את השינוי למשוב שלך, וזה יופיע בעמוד התיקונים הציבורי באתר.

מעבר לתיקון הנקודתי, השתמשתי במשוב כדי לעדכן את שיטת הבדיקה. הוספתי לשלב האימות קריטריון חדש (#15) שמזהה את התבנית הכללית: פוליטיקאי המצהיר שמוסד שבראשו הוא עומד יבצע פעולה נגד אדם או ארגון מזוהה. במקרים כאלה האתר ימשיך להציג את ההצהרה (כי היא חדשותית), אבל בפסק "חצי-אמת" עם אותה הסתייגות, ולא בפסק "אמת" שמטעה את הקוראים שהפעולה אכן תתרחש. בנוסף, ביצעתי סריקה על כל הטענות הקיימות באתר כדי לאתר ולעדכן מקרים דומים שהיו עד עכשיו מסומנים כ"אמת".

ההפרדה שעשית בין "ההצהרה אכן נאמרה" לבין "המוסד אכן יבצע" היא בדיוק הכשל שלי לא ראיתי, וההבחנה הזאת תשמש אותי בהמשך בכל פעם שאתקל בטענות מסוג זה. אם תיתקלי בעוד דוגמאות (גם מאותו סוג וגם של דפוסי כשל אחרים), אשמח לקבל אותן בכל זמן.

תודה שוב על הזמן ועל המעורבות.

עמרי
```

- [ ] **Step 2: No commit**

This is a one-time email draft. Past Tehila replies can stay in the user's email client.

---

## Task 10: Final verification

- [ ] **Step 1: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: clean (or only pre-existing errors not related to this work).

- [ ] **Step 2: Quick visual on the live site**

Run: dev server, navigate to `/politician/israel-katz`, find the Halutz claim. Verify:
- Verdict chip now shows חצי-אמת
- Explanation opens with the institutional-intent caveat
- /corrections shows the new correction with Tehila's name in the note

- [ ] **Step 3: Tally commits**

Run: `git log --oneline origin/master..HEAD`
Expected: ~7 commits (Task 1, 2, 3, 4, 5, 6, 7 — Tasks 8-10 don't commit).

- [ ] **Step 4: Don't push.** Standing rule — wait for the user to say "push".

---

## Self-Review (done before handing off)

**Spec coverage:**
- Fix specific claim → Task 2 ✓
- Fact-check prompt rule → Task 5 ✓
- Verifier criterion #15 → Task 3 ✓
- Editor category #11 → Task 6 ✓
- Post-processor for downgrade tag → Task 4 ✓
- Sweep script → Task 7 ✓
- Hebrew caveat text → in Task 1 (institutional-intent.ts) ✓
- Memory updates → Task 8 ✓
- Reply to Tehila → Task 9 ✓

**Placeholder scan:** none — every code block is complete, every regex/string spelled out.

**Type consistency:** `applyDowngrade` signature `{ verdict, explanation, notes } → { verdict: "half-true", explanation, notes }` used consistently in fact-check.ts, triage script, and sweep script. `DOWNGRADE_TAG` string-matched in verifier prompt and in fact-check.ts post-processor.

**Scope check:** focused — all five workstreams operate on the same principle, share `institutional-intent.ts`, and produce one user-visible change (the verdict downgrade pattern).
