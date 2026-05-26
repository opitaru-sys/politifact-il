#!/usr/bin/env tsx
/**
 * Nightly credibility snapshot job. For each politician, computes Wilson
 * lower bound over the trailing 30 days and upserts a CredibilitySnapshot
 * row dated today (or whatever `--asOf YYYY-MM-DD` is passed).
 *
 * Idempotent via the (politicianId, asOf, windowDays) unique constraint
 * — re-running the same day just updates the existing row.
 *
 * Wired into scripts/daily.mts so it runs as part of the daily cron.
 * Can also be run manually:
 *   npx tsx scripts/snapshot-credibility.mts
 *   npx tsx scripts/snapshot-credibility.mts --asOf 2026-05-20
 */
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const { wilsonLowerBound } = await import("../src/lib/queries");

const WINDOW_DAYS = 30;

function parseAsOf(): Date {
  const idx = process.argv.indexOf("--asOf");
  if (idx >= 0 && process.argv[idx + 1]) {
    const d = new Date(process.argv[idx + 1]);
    if (!Number.isNaN(d.getTime())) {
      // Anchor at end-of-day so the trailing window includes everything
      // said on that calendar day in any timezone.
      d.setUTCHours(23, 59, 59, 999);
      return d;
    }
  }
  const now = new Date();
  now.setUTCHours(23, 59, 59, 999);
  return now;
}

const asOf = parseAsOf();
const windowStart = new Date(asOf);
windowStart.setDate(windowStart.getDate() - WINDOW_DAYS);

const prisma = new PrismaClient();

console.log(`Snapshot job: asOf=${asOf.toISOString().slice(0, 10)} windowDays=${WINDOW_DAYS}`);

// Pull every politician. Then aggregate their published+approved claims
// in the window in-memory — cheaper than N round-trips for 120 politicians.
const politicians = await prisma.politician.findMany({
  select: { id: true },
});

let written = 0;
let skipped = 0;

for (const p of politicians) {
  const claims = await prisma.claim.findMany({
    where: {
      politicianId: p.id,
      status: "published",
      editorApproved: true,
      date: { gte: windowStart, lte: asOf },
    },
    select: { verdict: true },
  });

  const total = claims.length;
  if (total === 0) {
    skipped++;
    continue;
  }

  const trueClaims = claims.filter((c) => c.verdict === "true").length;
  const halfTrue = claims.filter((c) => c.verdict === "half-true").length;
  const falseClaims = claims.filter((c) => c.verdict === "false").length;
  const weightedTrue = trueClaims + halfTrue * 0.5;
  const truthPercentage = Math.round((weightedTrue / total) * 100);
  const credibilityScore = Math.round(wilsonLowerBound(weightedTrue, total) * 100);

  await prisma.credibilitySnapshot.upsert({
    where: {
      politicianId_asOf_windowDays: {
        politicianId: p.id,
        asOf,
        windowDays: WINDOW_DAYS,
      },
    },
    create: {
      politicianId: p.id,
      asOf,
      windowDays: WINDOW_DAYS,
      totalClaims: total,
      trueClaims,
      halfTrue,
      falseClaims,
      truthPercentage,
      credibilityScore,
    },
    update: {
      totalClaims: total,
      trueClaims,
      halfTrue,
      falseClaims,
      truthPercentage,
      credibilityScore,
    },
  });
  written++;
}

console.log(`Snapshot done. written=${written} skipped=${skipped} (no claims in window)`);
await prisma.$disconnect();
