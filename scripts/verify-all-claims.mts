#!/usr/bin/env tsx
/**
 * Retroactively run the second-pass verifier on every claim that hasn't
 * been verified yet. Use:  npx tsx scripts/verify-all-claims.mts
 *
 * Resets editorApproved for ALL claims first (the old flag was set by
 * the seed scripts based on origin, not on real review). Then runs the
 * AI verifier, persists approved/confidence/issues.
 *
 * Cost: ~$0.01 per claim, ~$1 for 100 claims.
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
forceLoadEnv("ANTHROPIC_API_KEY");
forceLoadEnv("DATABASE_URL");

if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.length < 10) {
  console.error("ANTHROPIC_API_KEY not loaded");
  process.exit(1);
}

const { PrismaClient } = await import("@prisma/client");
const { verifyClaim } = await import("../src/lib/verify-claim");
const prisma = new PrismaClient();

// Use raw SQL for the new fields since the Prisma client may not be regenerated yet
// (the running drain script holds the DLL).
async function getClaimsToVerify(forceAll: boolean = false): Promise<Array<{
  id: string;
  quote: string;
  verdict: string;
  summary: string | null;
  explanation: string;
  source: string;
  factSource: string | null;
  topic: string;
  politicianName: string;
}>> {
  const where = forceAll ? "1=1" : "(c.verifiedAt IS NULL)";
  return prisma.$queryRawUnsafe(`
    SELECT c.id, c.quote, c.verdict, c.summary, c.explanation, c.source, c.factSource, c.topic,
           p.name as politicianName
    FROM Claim c
    JOIN Politician p ON p.id = c.politicianId
    WHERE c.status = 'published' AND ${where}
    ORDER BY c.createdAt ASC
  `);
}

const forceAll = process.argv.includes("--all");
const claims = await getClaimsToVerify(forceAll);

console.log(`Verifying ${claims.length} claims${forceAll ? " (re-running all)" : " (only unverified)"}...`);
console.log(`Estimated cost: ~$${(claims.length * 0.01).toFixed(2)}`);

let approved = 0;
let rejected = 0;
let failed = 0;
const startTime = Date.now();

for (let i = 0; i < claims.length; i++) {
  const c = claims[i];
  const prefix = `[${i + 1}/${claims.length}]`;
  try {
    const result = await verifyClaim({
      quote: c.quote,
      verdict: c.verdict as "true" | "half-true" | "false",
      summary: c.summary,
      explanation: c.explanation,
      source: c.source,
      factSource: c.factSource,
      politicianName: c.politicianName,
      topic: c.topic,
    });

    const issuesString = result.issues.length > 0 ? result.issues.join("; ") : null;
    await prisma.$executeRawUnsafe(
      `UPDATE Claim
       SET editorApproved = ?, verifiedAt = datetime('now'), verifierNotes = ?
       WHERE id = ?`,
      result.approved ? 1 : 0,
      issuesString,
      c.id,
    );

    if (result.approved) {
      approved++;
      console.log(`${prefix} ✓ ${c.politicianName}: ${c.quote.slice(0, 60)}...`);
    } else {
      rejected++;
      console.log(`${prefix} ✗ ${c.politicianName}: ${result.issues.join(", ")}`);
    }
  } catch (err) {
    failed++;
    console.error(`${prefix} ! ${c.politicianName}: error —`, err);
  }
}

const elapsed = Math.round((Date.now() - startTime) / 1000);
console.log(`\n--- Verification complete ---`);
console.log(`Approved:  ${approved}`);
console.log(`Rejected:  ${rejected}`);
console.log(`Failed:    ${failed}`);
console.log(`Total:     ${claims.length} in ${elapsed}s`);

await prisma.$disconnect();
process.exit(0);
