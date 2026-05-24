#!/usr/bin/env tsx
/**
 * Re-verify the ~200 claims that the unverifiable sweep auto-removed.
 *
 * The original sweep matched on phrases like "לא ניתן לאמת" / "לא
 * נמצא מידע" anywhere in the explanation. Audit showed many of those
 * are GOOD fact-checks where the model acknowledged uncertainty on
 * one sub-detail but otherwise produced substantive verification.
 * The blanket un-approval was over-aggressive.
 *
 * This script:
 *   1. Finds claims whose `correctionNote` starts with the
 *      unverifiable marker.
 *   2. Re-runs the *current* verifier (much better than the version
 *      that originally approved them).
 *   3. If the verifier approves: revives the claim (editorApproved=
 *      true, clears correctionNote + correctedAt).
 *   4. If the verifier rejects: keeps the claim hidden but updates
 *      correctionNote to the new verifier's specific reason —
 *      more accurate than "the explanation said it wasn't checked."
 *
 * Cost: ~$0.001/claim (verifier doesn't use grounding). ~$0.20 total.
 *
 * Usage:
 *   npx tsx scripts/recheck-unverifiable.mts            # dry run
 *   npx tsx scripts/recheck-unverifiable.mts --apply    # actually write
 */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
const { verifyClaim } = await import("../src/lib/verify-claim");

const APPLY = process.argv.includes("--apply");

const claims = await prisma.claim.findMany({
  where: {
    correctionNote: { startsWith: "הוסר: ההסבר ציין שהטענה לא נבדקה" },
  },
  include: { politician: { select: { name: true } } },
});

console.log(`Re-verifying ${claims.length} unverifiable-flagged claims...\n`);

let revived = 0;
let keptHidden = 0;
let errored = 0;

for (const c of claims) {
  try {
    const result = await verifyClaim({
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

    if (result.approved) {
      revived++;
      console.log(
        `  ✓ REVIVE [${c.politician.name}] "${c.quote.slice(0, 80)}..."`,
      );
      if (APPLY) {
        await prisma.claim.update({
          where: { id: c.id },
          data: {
            editorApproved: true,
            correctionNote: null,
            correctedAt: null,
            verifierNotes: null,
            verifiedAt: new Date(),
          },
        });
      }
    } else {
      keptHidden++;
      const newReason = result.issues.length > 0
        ? `הוסר: ${result.issues.slice(0, 2).join("; ")}`
        : "הוסר: לא עבר את אימות העורך";
      console.log(
        `  ✗ KEEP HIDDEN [${c.politician.name}] new reason: ${result.issues.slice(0, 1).join("; ").slice(0, 80)}`,
      );
      if (APPLY) {
        await prisma.claim.update({
          where: { id: c.id },
          data: {
            correctionNote: newReason,
            verifierNotes: result.issues.join("; "),
            verifiedAt: new Date(),
          },
        });
      }
    }
  } catch (err) {
    errored++;
    console.error(
      `  ! ERROR [${c.politician.name}]:`,
      err instanceof Error ? err.message : err,
    );
  }
}

console.log("\n=== Summary ===");
console.log(`Reviewed:    ${claims.length}`);
console.log(`Would revive (now public):      ${revived}`);
console.log(`Would stay hidden (with new reason): ${keptHidden}`);
console.log(`Errored:                              ${errored}`);

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to actually update.");
}

await prisma.$disconnect();
