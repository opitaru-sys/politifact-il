#!/usr/bin/env tsx
/**
 * Re-fact-check recent RSS claims that got hidden by the verifier
 * because the original pass ran with grounding disabled.
 *
 * Targets: editorApproved=false, source != Knesset, createdAt within
 * the last 48h, status not manually-rejected. Re-runs factCheckClaim +
 * verifyClaim with grounding FORCED ON regardless of env.
 *
 * Cost: ~$0.05/claim. Typical batch is 10-25 claims = ~$0.50-1.25.
 *
 * Behavior: if the re-grounded verdict + verifier accepts, the claim
 * becomes publicly visible. If not, stays hidden but with a fresh
 * notes line so we can see whether grounding mattered.
 */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
const apiKey = env.match(/^GEMINI_API_KEY=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;
if (apiKey) process.env.GEMINI_API_KEY = apiKey;

// Force grounding ON for this run — overrides any leftover env from
// the bulk drain. We want the model to actually search.
delete process.env.BADAK_DISABLE_GROUNDING;

const { PrismaClient } = await import("@prisma/client");
const { factCheckClaim } = await import("../src/lib/fact-check");
const { verifyClaim } = await import("../src/lib/verify-claim");
const prisma = new PrismaClient();

const hoursBack = Number(process.argv[2] ?? "48");
const cutoff = new Date();
cutoff.setHours(cutoff.getHours() - hoursBack);

const claims = await prisma.claim.findMany({
  where: {
    status: "published",
    editorApproved: false,
    source: { not: "כנסת · מליאה" },
    createdAt: { gte: cutoff },
  },
  include: { politician: { select: { name: true, id: true } } },
  orderBy: { createdAt: "desc" },
});

console.log(`${claims.length} hidden RSS claims in last ${hoursBack}h.`);
console.log(`Estimated cost: ~$${(claims.length * 0.05).toFixed(2)} with grounding on.\n`);

let nowVisible = 0, stillHidden = 0, verdictChanged = 0, failed = 0;

for (let i = 0; i < claims.length; i++) {
  const c = claims[i];
  const prefix = `[${i + 1}/${claims.length}]`;
  try {
    const factCheck = await factCheckClaim({
      politicianName: c.politician.name,
      quote: c.quote,
      topic: c.topic,
    });
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
    if (oldVerdict !== factCheck.verdict) verdictChanged++;
    if (verification.approved) nowVisible++;
    else stillHidden++;
    await prisma.claim.update({
      where: { id: c.id },
      data: {
        verdict: factCheck.verdict,
        summary: factCheck.summary,
        explanation: factCheck.explanation,
        factSource: factCheck.factSource,
        factSourceUrl: factCheck.factSourceUrl,
        confidence: factCheck.confidence,
        editorApproved: verification.approved,
        verifiedAt: new Date(),
        verifierNotes: verification.issues.length ? verification.issues.join("; ") : null,
      },
    });
    const flag = verification.approved ? "✓ NOW VISIBLE" : "✗ still hidden";
    const verdictChange = oldVerdict === factCheck.verdict ? `=${factCheck.verdict}` : `${oldVerdict}→${factCheck.verdict}`;
    console.log(`${prefix} ${flag} ${verdictChange} (${c.politician.name}): ${c.quote.slice(0, 60)}`);
  } catch (err) {
    failed++;
    console.error(`${prefix} ! ${c.politician.name}: ${err instanceof Error ? err.message : err}`);
  }
}

console.log(`\n--- Re-fact-check with grounding complete ---`);
console.log(`Now visible:      ${nowVisible}`);
console.log(`Still hidden:     ${stillHidden}`);
console.log(`Verdict changed:  ${verdictChanged}`);
console.log(`Failed:           ${failed}`);
await prisma.$disconnect();
