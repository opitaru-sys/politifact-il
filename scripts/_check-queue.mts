#!/usr/bin/env tsx
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;
const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();

const unprocessed = await p.article.count({ where: { processed: false } });
const oldest = await p.article.findFirst({
  where: { processed: false, publishedAt: { not: null } },
  orderBy: { publishedAt: "asc" },
  select: { publishedAt: true, title: true, source: true },
});
const newest = await p.article.findFirst({
  where: { processed: false, publishedAt: { not: null } },
  orderBy: { publishedAt: "desc" },
  select: { publishedAt: true, title: true, source: true },
});

console.log(`Unprocessed queue depth: ${unprocessed}`);
if (oldest) console.log(`Oldest: ${oldest.publishedAt?.toISOString().slice(0, 10)} · ${oldest.source}`);
if (newest) console.log(`Newest: ${newest.publishedAt?.toISOString().slice(0, 10)} · ${newest.source}`);

const bySource = await p.article.groupBy({
  by: ["source"],
  where: { processed: false },
  _count: { id: true },
  orderBy: { _count: { id: "desc" } },
});
console.log("\nBy source:");
for (const s of bySource) console.log(`  ${String(s._count.id).padStart(4)}  ${s.source}`);

await p.$disconnect();
