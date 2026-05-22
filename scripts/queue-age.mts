#!/usr/bin/env tsx
/** Show the age distribution + source split of the unprocessed queue. */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();

const queue = await p.article.findMany({
  where: { processed: false },
  select: { source: true, fetchedAt: true, publishedAt: true, title: true },
  orderBy: { fetchedAt: "desc" },
});

console.log(`${queue.length} unprocessed articles\n`);

// By source
const bySource: Record<string, number> = {};
for (const a of queue) bySource[a.source] = (bySource[a.source] ?? 0) + 1;
console.log("By source:");
for (const [s, n] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${s.padEnd(28)} ${n}`);
}

// By age bucket
const now = Date.now();
const buckets = { "<1h": 0, "1-6h": 0, "6-24h": 0, "1-3d": 0, "3-7d": 0, ">7d": 0 };
for (const a of queue) {
  const h = (now - a.fetchedAt.getTime()) / 3600_000;
  if (h < 1) buckets["<1h"]++;
  else if (h < 6) buckets["1-6h"]++;
  else if (h < 24) buckets["6-24h"]++;
  else if (h < 72) buckets["1-3d"]++;
  else if (h < 168) buckets["3-7d"]++;
  else buckets[">7d"]++;
}
console.log("\nBy age (fetchedAt):");
for (const [k, n] of Object.entries(buckets)) {
  console.log(`  ${k.padEnd(8)} ${n}`);
}

// Sample of newest unprocessed
console.log("\nNewest 5 unprocessed:");
for (const a of queue.slice(0, 5)) {
  const ago = Math.round((now - a.fetchedAt.getTime()) / 60_000);
  console.log(`  [${ago}m ago] ${a.source}: ${a.title.slice(0, 70)}`);
}

await p.$disconnect();
