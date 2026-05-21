#!/usr/bin/env tsx
/**
 * Re-run factCheckClaim + verifyClaim on every published claim, with the
 * current prompts. Use after a meaningful prompt update.
 *
 * Useful when:
 * - We tighten extraction criteria (won't help old claims — already in DB)
 * - We tighten fact-check prompt (rerun → new verdict/summary/explanation)
 * - We tighten verifier prompt (rerun → new editorApproved + verifierNotes)
 *
 * Cost per claim: ~$0.025 (factCheck base) + up to 3 × $0.01 (web_search)
 * + $0.01 (verifier) = ~$0.06 max.
 *
 * 107 claims × $0.06 = ~$6.50 worst case.
 *
 * Skips claims where the politician was deleted (defensive).
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

function forceLoadEnv(key: string): void {
  if (process.env[key] && process.env[key]!.length > 5) return;
  for (const file of [".env.local", ".env"]) {
    try {
      const content = readFileSync(resolve(projectRoot, file), "utf8");
      const m = content.match(new RegExp(`^${key}=(.*)$`, "m"));
      if (m) {
        let val = m[1].trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.length > 5) {
          process.env[key] = val;
          return;
        }
      }
    } catch { /* ignore */ }
  }
}
forceLoadEnv("GEMINI_API_KEY");
forceLoadEnv("DATABASE_URL");

if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.length < 10) {
  console.error("GEMINI_API_KEY not loaded");
  process.exit(1);
}

const { PrismaClient } = await import("@prisma/client");
const { factCheckClaim } = await import("../src/lib/fact-check");
const { verifyClaim } = await import("../src/lib/verify-claim");
const prisma = new PrismaClient();

const claims = await prisma.claim.findMany({
  where: { status: "published" },
  orderBy: { createdAt: "asc" },
  include: { politician: { select: { name: true, id: true } } },
});

console.log(`Re-fact-checking ${claims.length} claims with current prompts...`);
console.log(`Estimated cost: ~$${(claims.length * 0.06).toFixed(2)} (worst case)`);
console.log("");

let updated = 0;
let verdictChanged = 0;
let approvalChanged = 0;
let failed = 0;
const startTime = Date.now();

// Counts of verdict transitions for the final report.
const transitions: Record<string, number> = {};

for (let i = 0; i < claims.length; i++) {
  const c = claims[i];
  const prefix = `[${i + 1}/${claims.length}]`;
  try {
    // Re-fact-check (uses new prompt + web_search).
    const factCheck = await factCheckClaim({
      politicianName: c.politician.name,
      quote: c.quote,
      topic: c.topic,
    });

    // Re-verify (uses new criteria).
    const verification = await verifyClaim({
      quote: c.quote,
      verdict: factCheck.verdict,
      summary: factCheck.summary,
      explanation: factCheck.explanation,
      source: c.source,
      factSource: factCheck.factSource,
      politicianName: c.politician.name,
      topic: c.topic,
    });

    const oldVerdict = c.verdict;
    const newVerdict = factCheck.verdict;
    const oldApproved = c.editorApproved;
    const newApproved = verification.approved;

    if (oldVerdict !== newVerdict) {
      verdictChanged++;
      const key = `${oldVerdict} → ${newVerdict}`;
      transitions[key] = (transitions[key] ?? 0) + 1;
    }
    if (oldApproved !== newApproved) approvalChanged++;

    await prisma.claim.update({
      where: { id: c.id },
      data: {
        verdict: newVerdict,
        summary: factCheck.summary,
        explanation: factCheck.explanation,
        factSource: factCheck.factSource,
        factSourceUrl: factCheck.factSourceUrl,
        confidence: factCheck.confidence,
        editorApproved: newApproved,
        verifiedAt: new Date(),
        verifierNotes: verification.issues.length ? verification.issues.join("; ") : null,
      },
    });

    updated++;
    const verdictTag = oldVerdict === newVerdict ? `=${newVerdict}` : `${oldVerdict}→${newVerdict}`;
    const approvedTag = newApproved ? "✓" : "✗";
    console.log(`${prefix} ${approvedTag} ${verdictTag} ${c.politician.name}: ${c.quote.slice(0, 50)}...`);
  } catch (err) {
    failed++;
    console.error(`${prefix} ! ${c.politician.name}: error —`, err instanceof Error ? err.message : err);
  }
}

const elapsed = Math.round((Date.now() - startTime) / 1000);
console.log(`\n--- Re-fact-check complete ---`);
console.log(`Updated:           ${updated}`);
console.log(`Verdict changed:   ${verdictChanged}`);
console.log(`Approval changed:  ${approvalChanged}`);
console.log(`Failed:            ${failed}`);
console.log(`Total:             ${claims.length} in ${Math.round(elapsed / 60)}m ${elapsed % 60}s`);
if (Object.keys(transitions).length) {
  console.log(`\nVerdict transitions:`);
  for (const [key, count] of Object.entries(transitions).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${key}: ${count}`);
  }
}

await prisma.$disconnect();
process.exit(0);
