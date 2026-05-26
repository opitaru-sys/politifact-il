#!/usr/bin/env tsx
/**
 * Audit approved claims by quote length. The Barkat "הקרן שהקמתי"
 * case (2-word fragment that passed all 4 layers) suggests the
 * pipeline accepts quotes too short to be meaningful standalone
 * statements. Quantify the scale before adding a filter.
 */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();

const claims = await p.claim.findMany({
  where: { status: "published", editorApproved: true },
  select: { id: true, quote: true, politicianId: true, verdict: true, source: true },
});

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

const buckets = { "1-3": 0, "4-5": 0, "6-9": 0, "10-19": 0, "20+": 0 };
const samples: Record<string, typeof claims[number][]> = { "1-3": [], "4-5": [] };

for (const c of claims) {
  const wc = wordCount(c.quote);
  if (wc <= 3) {
    buckets["1-3"]++;
    if (samples["1-3"].length < 15) samples["1-3"].push(c);
  } else if (wc <= 5) {
    buckets["4-5"]++;
    if (samples["4-5"].length < 10) samples["4-5"].push(c);
  } else if (wc <= 9) buckets["6-9"]++;
  else if (wc <= 19) buckets["10-19"]++;
  else buckets["20+"]++;
}

console.log(`Total approved claims: ${claims.length}\n`);
console.log(`Quote word-count distribution:`);
for (const [k, v] of Object.entries(buckets)) {
  console.log(`  ${k.padEnd(8)} ${v}`);
}

console.log(`\nSamples (1-3 words — likely fragments):`);
for (const c of samples["1-3"]) {
  console.log(`  [${c.verdict.padEnd(10)}] ${c.politicianId.padEnd(20)} "${c.quote}" (${c.source})`);
}

console.log(`\nSamples (4-5 words — possibly fragments):`);
for (const c of samples["4-5"]) {
  console.log(`  [${c.verdict.padEnd(10)}] ${c.politicianId.padEnd(20)} "${c.quote.slice(0, 80)}" (${c.source})`);
}

await p.$disconnect();
