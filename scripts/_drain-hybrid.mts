#!/usr/bin/env tsx
/**
 * Hybrid drain after the 2026-05-26 NAME_TO_ID coverage fix. Splits
 * the queue into two passes:
 *
 *   1. Knesset transcripts (most are procedural / historical text;
 *      grounded search adds little). Ungrounded, ~$0.005/article.
 *   2. Fresh RSS + Telegram (current news, benefits from grounding).
 *      Grounded, ~$0.05/claim.
 *
 * Cost: at 461 Knesset + 76 fresh, expect ~$15-20 total vs ~$60-80
 * if everything were grounded.
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

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const start = Date.now();

// ── Pass 1: Knesset, ungrounded ──────────────────────────────────
const knessetBefore = await prisma.article.count({
  where: { processed: false, source: "כנסת · מליאה" },
});
console.log(`\n=== Pass 1: ${knessetBefore} Knesset articles, ungrounded ===`);
process.env.BADAK_DISABLE_GROUNDING = "1";
const { processUnprocessedArticles } = await import("../src/lib/fact-check");
let knessetClaims = 0;
while (true) {
  const remaining = await prisma.article.count({
    where: { processed: false, source: "כנסת · מליאה" },
  });
  if (remaining === 0) break;
  const created = await processUnprocessedArticles({
    limit: 100,
    sources: ["כנסת · מליאה"],
    order: "oldest",
  });
  knessetClaims += created.length;
  console.log(`  Knesset: ${created.length} new claims (remaining: ${remaining - 100 < 0 ? 0 : remaining - 100})`);
}
delete process.env.BADAK_DISABLE_GROUNDING;
console.log(`\n✓ Pass 1 complete. ${knessetClaims} Knesset claims created.`);

// ── Pass 2: fresh news (RSS + Telegram), grounded ─────────────────
const freshBefore = await prisma.article.count({
  where: { processed: false, source: { not: "כנסת · מליאה" } },
});
console.log(`\n=== Pass 2: ${freshBefore} fresh articles, grounded ===`);
let freshClaims = 0;
while (true) {
  const remaining = await prisma.article.count({
    where: { processed: false, source: { not: "כנסת · מליאה" } },
  });
  if (remaining === 0) break;
  const created = await processUnprocessedArticles({
    limit: 25, // smaller batches for grounded — each call takes longer
    excludeSources: ["כנסת · מליאה"],
    order: "oldest",
  });
  freshClaims += created.length;
  console.log(`  Fresh: ${created.length} new claims (remaining: ${remaining - 25 < 0 ? 0 : remaining - 25})`);
}
console.log(`\n✓ Pass 2 complete. ${freshClaims} fresh claims created.`);

const elapsed = Math.round((Date.now() - start) / 1000);
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`Drain complete in ${Math.floor(elapsed / 60)}m ${elapsed % 60}s.`);
console.log(`  Knesset: ${knessetClaims} new claims`);
console.log(`  Fresh:   ${freshClaims} new claims`);
console.log(`  Total:   ${knessetClaims + freshClaims} new claims`);

await prisma.$disconnect();
process.exit(0);
