#!/usr/bin/env tsx
/** Audit: which politicians get a useful topic breakdown card? */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const { normalizeTopic } = await import("../src/lib/topics");
const { wilsonLowerBound } = await import("../src/lib/queries");
const p = new PrismaClient();

const MIN_PER_TOPIC = 5;

const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - 30);

const politicians = await p.politician.findMany({
  include: {
    claims: {
      where: { status: "published", editorApproved: true, date: { gte: cutoff } },
      select: { verdict: true, topic: true },
    },
  },
});

let willShow = 0;
const samples: { name: string; topics: { topic: string; n: number; cred: number }[] }[] = [];

for (const pol of politicians) {
  const byTopic = new Map<string, { trueClaims: number; halfTrue: number; falseClaims: number; total: number }>();
  for (const c of pol.claims) {
    const key = normalizeTopic(c.topic);
    if (!key) continue;
    if (!byTopic.has(key)) byTopic.set(key, { trueClaims: 0, halfTrue: 0, falseClaims: 0, total: 0 });
    const b = byTopic.get(key)!;
    b.total++;
    if (c.verdict === "true") b.trueClaims++;
    else if (c.verdict === "half-true") b.halfTrue++;
    else if (c.verdict === "false") b.falseClaims++;
  }
  const eligible: { topic: string; n: number; cred: number }[] = [];
  for (const [topic, b] of byTopic.entries()) {
    if (b.total < MIN_PER_TOPIC) continue;
    const weighted = b.trueClaims + b.halfTrue * 0.5;
    eligible.push({
      topic,
      n: b.total,
      cred: Math.round(wilsonLowerBound(weighted, b.total) * 100),
    });
  }
  if (eligible.length >= 2) {
    willShow++;
    if (samples.length < 6) {
      samples.push({ name: pol.name, topics: eligible.sort((a, b) => b.n - a.n) });
    }
  }
}

console.log(`Will show breakdown: ${willShow}/${politicians.length} politicians (30-day window, min ${MIN_PER_TOPIC} per topic, min 2 topics)\n`);
for (const s of samples) {
  console.log(`${s.name}:`);
  for (const t of s.topics) console.log(`  ${t.n}x  ${t.topic}  → ${t.cred}%`);
  console.log();
}

await p.$disconnect();
