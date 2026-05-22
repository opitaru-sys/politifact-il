#!/usr/bin/env tsx
/**
 * Audit: where do our published claims actually come from?
 *
 * Useful for deciding whether to keep ingesting Knesset transcripts
 * (high volume, single-day spikes on session days) or focus on RSS
 * news outlets (daily coverage, smoother distribution).
 */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();

const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - 30);

const [all, recent] = await Promise.all([
  p.claim.groupBy({
    by: ["source"],
    where: { status: "published", editorApproved: true },
    _count: true,
  }),
  p.claim.groupBy({
    by: ["source"],
    where: { status: "published", editorApproved: true, date: { gte: cutoff } },
    _count: true,
  }),
]);

const recentMap = Object.fromEntries(recent.map((r) => [r.source, r._count]));

console.log("=== Approved claims by source ===\n");
console.log(`${"Source".padEnd(28)}${"All-time".padStart(10)}${"Last 30d".padStart(12)}`);
console.log("-".repeat(50));
for (const row of all.sort((a, b) => b._count - a._count)) {
  const last30 = recentMap[row.source] ?? 0;
  console.log(`${row.source.padEnd(28)}${String(row._count).padStart(10)}${String(last30).padStart(12)}`);
}

const totalAll = all.reduce((s, r) => s + r._count, 0);
const totalRecent = recent.reduce((s, r) => s + r._count, 0);
console.log("-".repeat(50));
console.log(`${"Total".padEnd(28)}${String(totalAll).padStart(10)}${String(totalRecent).padStart(12)}`);

// Now: how many days in last 30 have at least 1 claim from each source?
const days = await p.claim.findMany({
  where: { status: "published", editorApproved: true, date: { gte: cutoff } },
  select: { source: true, date: true },
});
const daysBySource: Record<string, Set<string>> = {};
for (const c of days) {
  const day = c.date.toISOString().slice(0, 10);
  if (!daysBySource[c.source]) daysBySource[c.source] = new Set();
  daysBySource[c.source].add(day);
}

console.log("\n=== Day coverage in the last 30 days ===\n");
console.log(`${"Source".padEnd(28)}${"Distinct days".padStart(16)}`);
console.log("-".repeat(44));
for (const row of recent.sort((a, b) => b._count - a._count)) {
  const days = daysBySource[row.source]?.size ?? 0;
  console.log(`${row.source.padEnd(28)}${String(days + "/30").padStart(16)}`);
}

await p.$disconnect();
