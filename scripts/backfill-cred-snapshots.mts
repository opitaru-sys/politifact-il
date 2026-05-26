#!/usr/bin/env tsx
/**
 * One-off backfill: populate CredibilitySnapshot for the trailing N months
 * (default 12), sampled weekly. Gives the profile-page timeline chart
 * historical data and seeds the BiggestMovers card so it can start
 * showing useful comparisons immediately rather than waiting weeks.
 *
 * Idempotent via the (politicianId, asOf, windowDays) unique constraint.
 *
 * Dry-run by default. Pass --apply to commit:
 *   npx tsx scripts/backfill-cred-snapshots.mts
 *   npx tsx scripts/backfill-cred-snapshots.mts --apply
 *   npx tsx scripts/backfill-cred-snapshots.mts --apply --months 6
 */
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const { wilsonLowerBound } = await import("../src/lib/queries");

const APPLY = process.argv.includes("--apply");
const monthsIdx = process.argv.indexOf("--months");
const MONTHS_BACK = monthsIdx >= 0 ? Number(process.argv[monthsIdx + 1]) : 12;
const WINDOW_DAYS = 30;

const prisma = new PrismaClient();

const now = new Date();
const cutoffStart = new Date(now);
cutoffStart.setMonth(cutoffStart.getMonth() - MONTHS_BACK);

// Sample points: weekly, ending today, going back MONTHS_BACK months.
const samplePoints: Date[] = [];
const cursor = new Date(now);
cursor.setUTCHours(23, 59, 59, 999);
while (cursor >= cutoffStart) {
  samplePoints.push(new Date(cursor));
  cursor.setDate(cursor.getDate() - 7);
}
samplePoints.reverse(); // oldest first for nicer progress logs

console.log(`Backfill plan: ${samplePoints.length} weekly samples × politicians, ${MONTHS_BACK} months back`);
console.log(`Window: ${WINDOW_DAYS}d rolling. First sample: ${samplePoints[0].toISOString().slice(0, 10)} · Last: ${samplePoints[samplePoints.length - 1].toISOString().slice(0, 10)}`);

const politicians = await prisma.politician.findMany({ select: { id: true } });
console.log(`Politicians: ${politicians.length}\n`);

if (!APPLY) {
  console.log(`Total operations planned: ${samplePoints.length * politicians.length}`);
  console.log("Dry-run. Re-run with --apply to commit.");
  await prisma.$disconnect();
  process.exit(0);
}

let written = 0;
let skipped = 0;
let pointsDone = 0;

for (const asOf of samplePoints) {
  const windowStart = new Date(asOf);
  windowStart.setDate(windowStart.getDate() - WINDOW_DAYS);

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
  pointsDone++;
  if (pointsDone % 5 === 0 || pointsDone === samplePoints.length) {
    console.log(
      `  [${pointsDone}/${samplePoints.length}] up to ${asOf.toISOString().slice(0, 10)} · written=${written} skipped=${skipped}`,
    );
  }
}

console.log(`\nBackfill done. written=${written} skipped=${skipped}`);
await prisma.$disconnect();
