#!/usr/bin/env tsx
/**
 * Backfill: run the editorial newsworthiness review on existing
 * editor-approved claims. The new third-pass agent (editorial-review.ts)
 * was added on 2026-05-26 — this script runs it once on the historical
 * corpus so the existing approved set reflects the new editorial bar.
 *
 * Conservative dial: when in doubt, the editor approves. Expected
 * rejection rate: ~10-20% of currently-approved claims (mostly
 * routine "I signed / I met / I led" press-release content).
 *
 * Cost: ~$0.001 per claim, no grounding. For 2,800 claims that's
 * ~$2-3 one-time. Set --limit N to cap for testing.
 *
 * Idempotent: only touches claims that don't already have an
 * editorial note (skip if verifierNotes starts with "[עורך]").
 *
 * Usage:
 *   npx tsx scripts/apply-editorial-review.mts                  # dry run
 *   npx tsx scripts/apply-editorial-review.mts --apply           # actually un-approve
 *   npx tsx scripts/apply-editorial-review.mts --apply --limit 50
 *   npx tsx scripts/apply-editorial-review.mts --apply --batch-size 5
 */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;
const geminiKey = env.match(/^GEMINI_API_KEY=(.*)$/m)?.[1]?.trim();
if (geminiKey) process.env.GEMINI_API_KEY = geminiKey;

const APPLY = process.argv.includes("--apply");
const LIMIT_FLAG = process.argv.indexOf("--limit");
const LIMIT = LIMIT_FLAG > 0 ? Number(process.argv[LIMIT_FLAG + 1]) : undefined;
const BATCH_FLAG = process.argv.indexOf("--batch-size");
const BATCH_SIZE = BATCH_FLAG > 0 ? Number(process.argv[BATCH_FLAG + 1]) : 8;

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const { editorialReview } = await import("../src/lib/editorial-review");

const claims = await prisma.claim.findMany({
  where: {
    editorApproved: true,
    status: "published",
    // Skip claims that already have an editorial note (re-running is a no-op).
    // SQL NULL semantics: `verifierNotes NOT LIKE 'X'` returns NULL for NULL
    // rows, which fails WHERE — so we have to OR in the null check explicitly.
    OR: [
      { verifierNotes: null },
      { verifierNotes: { not: { startsWith: "[עורך]" } } },
    ],
  },
  include: { politician: { select: { name: true } } },
  orderBy: { createdAt: "desc" }, // newest first so the screenshot's claims get reviewed early
  take: LIMIT,
});

console.log(`Editorial backfill: ${claims.length} approved claims to review`);
if (!APPLY) console.log("(dry run — set --apply to actually un-approve)");
console.log("");

let approved = 0;
let rejected = 0;
let errored = 0;

// Process in batches so we get progress output and respect API rate limits.
for (let i = 0; i < claims.length; i += BATCH_SIZE) {
  const batch = claims.slice(i, i + BATCH_SIZE);
  const results = await Promise.allSettled(
    batch.map(async (c) => {
      const r = await editorialReview({
        quote: c.quote,
        verdict: c.verdict as "true" | "half-true" | "false",
        summary: c.summary,
        explanation: c.explanation,
        politicianName: c.politician.name,
        topic: c.topic,
        claimDate: c.date,
      });
      return { claim: c, result: r };
    }),
  );

  for (const settled of results) {
    if (settled.status === "rejected") {
      errored++;
      continue;
    }
    const { claim, result } = settled.value;
    if (result.approved) {
      approved++;
    } else {
      rejected++;
      console.log(
        `  ✗ [${claim.politician.name} · ${claim.verdict}] ${result.reason}`,
      );
      console.log(`    "${claim.quote.slice(0, 120)}"`);
      if (APPLY) {
        const existingNotes = claim.verifierNotes ? `; ${claim.verifierNotes}` : "";
        await prisma.claim.update({
          where: { id: claim.id },
          data: {
            editorApproved: false,
            verifierNotes: `[עורך] ${result.reason}${existingNotes}`,
            correctionNote: `הוסר עורכותית: ${result.reason}`,
            correctedAt: new Date(),
          },
        });
      }
    }
  }

  const done = Math.min(i + BATCH_SIZE, claims.length);
  console.log(
    `  [${done}/${claims.length}] approved=${approved} rejected=${rejected} errored=${errored}`,
  );
}

console.log(`\n=== Done ===`);
console.log(`  Reviewed:  ${claims.length}`);
console.log(`  Approved:  ${approved} (${Math.round(approved / Math.max(1, claims.length) * 100)}%)`);
console.log(`  Rejected:  ${rejected} (${Math.round(rejected / Math.max(1, claims.length) * 100)}%)`);
console.log(`  Errored:   ${errored}`);
if (!APPLY) console.log(`\n(dry run — no DB changes. re-run with --apply.)`);

await prisma.$disconnect();
