#!/usr/bin/env tsx
/**
 * Drain the entire unprocessed article queue, in batches of 100,
 * until empty. Use:  npx tsx scripts/drain-queue.mts
 *
 * Each batch takes ~5-8 min. Cost ~$0.005-0.01 per article processed.
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
const { processUnprocessedArticles } = await import("../src/lib/fact-check");
const prisma = new PrismaClient();

const startTime = Date.now();
let totalClaims = 0;
let batchNum = 0;

while (true) {
  const remaining = await prisma.article.count({ where: { processed: false } });
  if (remaining === 0) {
    console.log(`\n✓ Queue empty. Processed ${batchNum} batches in ${Math.round((Date.now() - startTime) / 1000)}s, created ${totalClaims} claims total.`);
    break;
  }
  batchNum++;
  console.log(`\n--- Batch ${batchNum} (${remaining} remaining) ---`);
  const created = await processUnprocessedArticles(100);
  totalClaims += created.length;
  console.log(`Batch ${batchNum} done: ${created.length} new claims (total so far: ${totalClaims})`);
}

await prisma.$disconnect();
process.exit(0);
