#!/usr/bin/env tsx
/** Quick verification of the CredibilitySnapshot table content. */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const { getBiggestMovers } = await import("../src/lib/cred-history");
const p = new PrismaClient();

// Distribution of totalClaims for the most recent snapshot date.
const latest = await p.credibilitySnapshot.findMany({
  where: { asOf: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  select: { totalClaims: true },
});
const counts = latest.map((r) => r.totalClaims).sort((a, b) => b - a);
console.log(`Most-recent snapshot (last 24h): ${latest.length} politicians`);
console.log(`Top 10 totalClaims: ${counts.slice(0, 10).join(", ")}`);
console.log(`At >=15:  ${counts.filter((c) => c >= 15).length}`);
console.log(`At >=10:  ${counts.filter((c) => c >= 10).length}`);
console.log(`At >=5:   ${counts.filter((c) => c >= 5).length}`);
console.log(`At >=3:   ${counts.filter((c) => c >= 3).length}`);

// Try movers with different thresholds.
for (const minSample of [15, 10, 5, 3]) {
  const m = await getBiggestMovers({ daysBack: 7, minSample, topN: 3 });
  console.log(`\nminSample=${minSample}: gainers=${m.gainers.length} losers=${m.losers.length}`);
  for (const g of m.gainers) {
    console.log(`  ↑ ${g.politician.name} +${g.delta.toFixed(1)} (cur=${g.currentScore}% n=${g.currentSample}, prev=${g.previousScore}% n=${g.previousSample})`);
  }
  for (const l of m.losers) {
    console.log(`  ↓ ${l.politician.name} ${l.delta.toFixed(1)} (cur=${l.currentScore}% n=${l.currentSample}, prev=${l.previousScore}% n=${l.previousSample})`);
  }
}

await p.$disconnect();
