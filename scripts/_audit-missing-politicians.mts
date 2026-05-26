#!/usr/bin/env tsx
/**
 * Tier-3 coverage audit: list every politicianName the AI extraction
 * has ever returned that DOESN'T resolve to an entry in NAME_TO_ID.
 * These are claims the pipeline saw but dropped at the lookup step.
 *
 * The output is sorted by frequency, so the most-quoted-but-missing
 * politicians surface first. Use it to decide who to add next.
 */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const { NAME_TO_ID } = await import("../src/lib/rss-feeds");
const p = new PrismaClient();

const articles = await p.article.findMany({
  where: { processed: true, extractedData: { not: null } },
  select: { extractedData: true, source: true, title: true },
});

const missingCounts = new Map<string, { count: number; examples: { source: string; title: string }[] }>();
let totalExtracted = 0;
let totalMatched = 0;

for (const a of articles) {
  if (!a.extractedData) continue;
  try {
    const ex = JSON.parse(a.extractedData) as { politicianName: string }[];
    for (const item of ex) {
      totalExtracted++;
      const name = (item.politicianName || "").trim();
      if (!name) continue;
      if (NAME_TO_ID[name]) {
        totalMatched++;
        continue;
      }
      const existing = missingCounts.get(name);
      if (existing) {
        existing.count++;
        if (existing.examples.length < 2) {
          existing.examples.push({ source: a.source, title: a.title.slice(0, 60) });
        }
      } else {
        missingCounts.set(name, {
          count: 1,
          examples: [{ source: a.source, title: a.title.slice(0, 60) }],
        });
      }
    }
  } catch {
    // ignore malformed extractedData
  }
}

const sorted = Array.from(missingCounts.entries())
  .map(([name, info]) => ({ name, ...info }))
  .sort((a, b) => b.count - a.count);

console.log(`Total extracted claims: ${totalExtracted}`);
console.log(`Matched to NAME_TO_ID:  ${totalMatched}`);
console.log(`Dropped (unknown name): ${totalExtracted - totalMatched}`);
console.log(`Distinct unknown names: ${sorted.length}\n`);

console.log(`=== TOP MISSING POLITICIANS (≥3 extractions) ===`);
for (const r of sorted.filter((r) => r.count >= 3)) {
  console.log(`  ${String(r.count).padStart(3)}x  ${r.name}`);
  for (const ex of r.examples) {
    console.log(`         e.g. [${ex.source}] ${ex.title}`);
  }
}

console.log(`\n=== ALL UNKNOWN NAMES (count >= 1) ===`);
const lowCount = sorted.filter((r) => r.count < 3);
for (const r of lowCount) {
  console.log(`  ${String(r.count).padStart(3)}x  ${r.name}`);
}

await p.$disconnect();
