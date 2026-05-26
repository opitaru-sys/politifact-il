#!/usr/bin/env tsx
/** Per-topic quick audit: how many politicians + claims would each topic page show? */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { listCanonicalTopics } = await import("../src/lib/topics");
const { getPoliticianStatsForTopic, getRecentClaimsForTopic } = await import(
  "../src/lib/topic-stats"
);

const topics = listCanonicalTopics();
console.log(`${topics.length} canonical topics. 30-day window:\n`);
for (const t of topics) {
  const [stats, claims] = await Promise.all([
    getPoliticianStatsForTopic(t.slug, 30),
    getRecentClaimsForTopic(t.slug, 30, 30),
  ]);
  const ranked = stats.filter((s) => s.totalClaims >= 3);
  const top = ranked[0];
  console.log(
    `  ${t.slug.padEnd(15)} ${t.label.padEnd(12)} → ${ranked.length} ranked politicians, ${claims.length} recent claims` +
      (top ? `  · #1: ${top.politician.name} ${top.credibilityScore}%` : ""),
  );
}
