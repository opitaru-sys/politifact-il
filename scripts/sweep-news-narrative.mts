#!/usr/bin/env tsx
/**
 * Sweep — flag approved claims that match the "news narrative" /
 * "self-referencing 3rd person" / "hyperbolic insult" patterns and
 * un-approve them. Idempotent: re-running on already-swept rows is
 * a no-op.
 *
 * Same convention as the other sweeps in this folder: sets
 * `editorApproved=false` (keeps `status=published`) so a future
 * verifier re-run can revive a claim if its quote is rewritten or
 * the heuristic is later proved wrong. We don't delete.
 *
 * Three orthogonal patterns, each on its own counter so the audit
 * log shows which class is dominating:
 *
 *  A. News narrative — quote has no quote marks, no first-person
 *     pronouns, no attribution verbs, and starts with a past-tense
 *     3rd-person action verb. e.g. "חתם על צו לפינוי..."
 *
 *  B. Self-referencing 3rd person — politician's own name appears
 *     INSIDE their quote. e.g. May Golan's "quote" being
 *     "בעקבות הסרטונים של בן גביר..." or any case where the speaker
 *     refers to themselves in 3rd person. Usually means the
 *     extractor pulled news prose and mis-attributed it.
 *
 *  C. Hyperbolic insult — quote contains opinion/insult markers
 *     ("ההזויים", "פסיכי", "מטורף", "בוגד" etc.) and lacks any
 *     fact-checkable anchor (no numbers, no specific event, no
 *     first-person action).
 *
 * Usage:
 *   npx tsx scripts/sweep-news-narrative.mts            # dry run
 *   npx tsx scripts/sweep-news-narrative.mts --apply    # actually unapproves
 */
import { readFileSync } from "fs";
import type { ClaimQualityIssue } from "../src/lib/claim-quality";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");

interface Claim {
  id: string;
  quote: string;
  politicianId: string;
  politicianName: string;
  verdict: string;
  editorApproved: boolean;
  source: string;
}

async function main() {
  const claimQualityModule = await import("../src/lib/claim-quality");
  const claimQuality = ("default" in claimQualityModule
    ? claimQualityModule.default
    : claimQualityModule) as typeof import("../src/lib/claim-quality");

  const claims: Claim[] = await prisma.$queryRaw`
    SELECT c.id, c.quote, c."politicianId", p.name as "politicianName",
           c.verdict, c."editorApproved", c.source
    FROM "Claim" c
    JOIN "Politician" p ON p.id = c."politicianId"
    WHERE c."editorApproved" = true AND c.status = 'published'
  `;

  console.log(`Scanning ${claims.length} approved+published claims...\n`);

  const flagged: { claim: Claim; reason: string }[] = [];
  const stats = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, H: 0 };

  for (const claim of claims) {
    const issues: ClaimQualityIssue[] = claimQuality.findClaimQualityIssues({
      quote: claim.quote,
      politicianName: claim.politicianName,
      source: claim.source,
    });
    if (issues.length === 0) continue;

    if (issues.some((issue) => issue.code === "news-narrative")) stats.A++;
    if (issues.some((issue) => issue.code === "self-reference")) stats.B++;
    if (issues.some((issue) => issue.code === "opinion-insult")) stats.C++;
    if (issues.some((issue) => issue.code === "eulogy-memorial")) stats.D++;
    if (issues.some((issue) => issue.code === "ceremonial")) stats.E++;
    if (issues.some((issue) => issue.code === "metaphor-idiom")) stats.F++;
    if (issues.some((issue) => issue.code === "private-conversation")) stats.G++;
    if (issues.some((issue) => issue.code === "knesset-procedural")) stats.H++;

    flagged.push({ claim, reason: issues.map((issue) => issue.reason).join("; ") });
  }

  console.log(`Flagged: ${flagged.length}`);
  console.log(`  Pattern A (news narrative):       ${stats.A}`);
  console.log(`  Pattern B (self-referencing 3p):  ${stats.B}`);
  console.log(`  Pattern C (hyperbolic insult):    ${stats.C}`);
  console.log(`  Pattern D (eulogy / memorial):    ${stats.D}`);
  console.log(`  Pattern E (ceremonial / PR):      ${stats.E}`);
  console.log(`  Pattern F (metaphor / idiom):     ${stats.F}`);
  console.log(`  Pattern G (private conversation): ${stats.G}`);
  console.log(`  Pattern H (knesset procedural):   ${stats.H}`);
  console.log(`  (counters may overlap when a row hits multiple patterns)\n`);

  for (const { claim, reason } of flagged.slice(0, 40)) {
    console.log(`[${claim.politicianName} · ${claim.verdict}] ${reason}`);
    console.log(`  "${claim.quote.slice(0, 140)}"`);
    console.log();
  }
  if (flagged.length > 40) {
    console.log(`... and ${flagged.length - 40} more.`);
  }

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to actually un-approve these claims.");
  } else {
    console.log("\nApplying...");
    // We can't use updateMany here because each row gets its own
    // human-readable correction note (the matched reason). Loop per
    // claim and update individually — N is small (≤30 typically) so
    // the round-trip cost is fine.
    const now = new Date();
    let applied = 0;
    for (const { claim, reason } of flagged) {
      await prisma.claim.update({
        where: { id: claim.id },
        data: {
          editorApproved: false,
          correctionNote: `הוסר: ${reason}`,
          correctedAt: now,
        },
      });
      applied++;
    }
    console.log(`Un-approved ${applied} claims and logged in /corrections.`);
  }

  await prisma.$disconnect();
}

await main();
