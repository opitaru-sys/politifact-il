#!/usr/bin/env tsx
/**
 * One-time backfill for the /corrections log. Identifies historical
 * corrections — claims that were once publicly visible but got
 * un-approved by an earlier sweep — and sets `correctionNote` +
 * `correctedAt` on each one so the public corrections page can
 * surface them.
 *
 * Heuristic for "this was once public":
 *   - status = 'published'  (not rejected at extraction)
 *   - editorApproved = false (currently hidden)
 *   - verifiedAt IS NOT NULL (the second-pass verifier ran on it)
 *
 * The third condition is the key one. The verifier only runs on
 * claims that already passed extraction — so a verifier-touched
 * claim that's now hidden was un-approved by something downstream
 * (a sweep, an admin action), not rejected at extraction. That's
 * the definition of a "correction" for our purposes.
 *
 * Sub-categorization (which reason to log) is best-effort: we run
 * each historical correction through the same `claim-quality`
 * detector that powers `sweep-news-narrative.mts`, plus check
 * against the existing `verifierNotes` field for hints from older
 * sweeps. Claims that no detector recognises get a generic
 * "הוסר במסגרת בדיקת איכות" note — better than no note.
 *
 * Idempotent: claims that already have a `correctionNote` set are
 * skipped. Safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/backfill-corrections.mts            # dry run
 *   npx tsx scripts/backfill-corrections.mts --apply    # actually write
 */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");

const claimQuality = await import("../src/lib/claim-quality");

interface Row {
  id: string;
  quote: string;
  politicianId: string;
  verifierNotes: string | null;
  updatedAt: Date;
  source: string;
  politician: { name: string };
}

const candidates = (await prisma.claim.findMany({
  where: {
    status: "published",
    editorApproved: false,
    verifiedAt: { not: null },
    correctionNote: null, // idempotency — skip already-backfilled rows
  },
  select: {
    id: true,
    quote: true,
    politicianId: true,
    verifierNotes: true,
    updatedAt: true,
    source: true,
    politician: { select: { name: true } },
  },
})) as Row[];

console.log(`Scanning ${candidates.length} candidate corrections...\n`);

interface Categorized {
  row: Row;
  note: string;
  // updatedAt is the best proxy we have for when the change happened.
  // It updates on any field change, so it's not perfect — but for a
  // claim that hasn't been edited since the sweep ran, it's accurate.
  correctedAt: Date;
}

const buckets = {
  newsNarrative: 0,
  selfReference: 0,
  insult: 0,
  unverifiable: 0,
  rhetoric: 0,
  rollcall: 0,
  generic: 0,
};

const categorized: Categorized[] = [];

for (const row of candidates) {
  let note: string | null = null;

  // Prefer hints from `verifierNotes` (older sweeps wrote here).
  const notes = row.verifierNotes ?? "";
  if (/explanation admits non-verifiability/i.test(notes)) {
    note = "הוסר: ההסבר ציין שהטענה לא נבדקה";
    buckets.unverifiable++;
  } else if (/rhetoric|sloganistic/i.test(notes)) {
    note = "הוסר: רטוריקה/סלוגן";
    buckets.rhetoric++;
  } else if (/roll-call|procedural|housekeeping|ceremonial|tally|presence/i.test(notes)) {
    note = "הוסר: תוכן פרוצדורלי של פרוטוקול הכנסת";
    buckets.rollcall++;
  } else {
    // Fall back to running the live claim-quality detector — catches
    // the news-narrative / self-reference / insult cases.
    const issues = claimQuality.findClaimQualityIssues({
      quote: row.quote,
      politicianName: row.politician.name,
      source: row.source,
    });
    if (issues.length > 0) {
      const reasons = issues.map((i) => i.reason).join("; ");
      note = `הוסר: ${reasons}`;
      if (issues.some((i) => i.code === "news-narrative")) buckets.newsNarrative++;
      else if (issues.some((i) => i.code === "self-reference")) buckets.selfReference++;
      else if (issues.some((i) => i.code === "opinion-insult")) buckets.insult++;
    } else {
      // No detector identified a reason. Skip — adding a generic
      // "removed for quality" message to >1000 rows would dilute
      // the corrections page. A correction we can't explain isn't
      // useful to readers; better to omit than to handwave.
      buckets.generic++;
      continue;
    }
  }

  categorized.push({ row, note, correctedAt: row.updatedAt });
}

console.log(`Categorized ${categorized.length} historical corrections:`);
console.log(`  News narrative:    ${buckets.newsNarrative}`);
console.log(`  Self-reference:    ${buckets.selfReference}`);
console.log(`  Insult/opinion:    ${buckets.insult}`);
console.log(`  Unverifiable:      ${buckets.unverifiable}`);
console.log(`  Rhetoric/slogan:   ${buckets.rhetoric}`);
console.log(`  Knesset rollcall:  ${buckets.rollcall}`);
console.log(`  Generic (unknown): ${buckets.generic}`);
console.log();

if (!APPLY) {
  console.log("Dry run. Re-run with --apply to write correctionNote + correctedAt.");
  console.log("\nSample (first 10):");
  for (const c of categorized.slice(0, 10)) {
    console.log(`  [${c.row.politician.name}] ${c.note}`);
    console.log(`    "${c.row.quote.slice(0, 100)}"`);
  }
} else {
  console.log("Applying...");
  let applied = 0;
  for (const c of categorized) {
    await prisma.claim.update({
      where: { id: c.row.id },
      data: { correctionNote: c.note, correctedAt: c.correctedAt },
    });
    applied++;
    if (applied % 50 === 0) console.log(`  ${applied}/${categorized.length}...`);
  }
  console.log(`Wrote correction notes on ${applied} claims.`);
}

await prisma.$disconnect();
