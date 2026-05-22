#!/usr/bin/env tsx
/**
 * Re-run the verifier on claims whose verifierNotes is the fail-closed
 * "שגיאה בתהליך האימות" string. These are claims where the verifier
 * API call itself errored (usually rate-limit), not where the claim
 * was actually rejected. Cheap and safe to retry.
 */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
const apiKey = env.match(/^GEMINI_API_KEY=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;
if (apiKey) process.env.GEMINI_API_KEY = apiKey;

const { PrismaClient } = await import("@prisma/client");
const { verifyClaim } = await import("../src/lib/verify-claim");
const prisma = new PrismaClient();

const errored = await prisma.claim.findMany({
  where: {
    status: "published",
    editorApproved: false,
    verifierNotes: "שגיאה בתהליך האימות",
  },
  include: { politician: { select: { name: true } } },
  orderBy: { createdAt: "desc" },
});

console.log(`${errored.length} claims fail-closed on verifier error. Re-running...\n`);

let approved = 0, rejected = 0, failed = 0;
for (let i = 0; i < errored.length; i++) {
  const c = errored[i];
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
    });
    await prisma.claim.update({
      where: { id: c.id },
      data: {
        editorApproved: result.approved,
        verifiedAt: new Date(),
        verifierNotes: result.issues.length ? result.issues.join("; ") : null,
      },
    });
    if (result.approved) { approved++; console.log(`[${i+1}/${errored.length}] ✓ ${c.politician.name}: ${c.quote.slice(0, 60)}`); }
    else { rejected++; console.log(`[${i+1}/${errored.length}] ✗ ${c.politician.name}: ${result.issues.join("; ")}`); }
  } catch (err) {
    failed++;
    console.error(`[${i+1}/${errored.length}] ! ${c.politician.name}:`, err instanceof Error ? err.message : err);
  }
}
console.log(`\nApproved: ${approved} · Rejected: ${rejected} · Failed: ${failed}`);
await prisma.$disconnect();
