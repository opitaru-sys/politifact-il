#!/usr/bin/env tsx
/**
 * Diagnostic: dump every unprocessed Article row so we can see
 * exactly which ones are stuck and why a cron run might be
 * skipping them. Shows source, age, content length, and the
 * speaker (if it's a Knesset transcript) — the three things that
 * decide whether `processArticle` short-circuits before calling
 * the AI:
 *
 *  1. Knesset article + speaker not in NAME_TO_ID → skipped
 *  2. content length < 250 chars OR no quote/attribution markers
 *     → `shouldSkipExtraction` skips
 *  3. otherwise the AI sees it, but may yield 0 claims (e.g. the
 *     extractor rejects rhetoric). Still marks `processed=true`.
 *
 * If articles linger as `processed=false`, the cron didn't run OR
 * crashed mid-batch.
 */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const stuck = await prisma.article.findMany({
  where: { processed: false },
  orderBy: { fetchedAt: "desc" },
  select: {
    id: true,
    title: true,
    url: true,
    source: true,
    content: true,
    fetchedAt: true,
  },
});

console.log(`${stuck.length} unprocessed articles:\n`);
const now = Date.now();
for (const a of stuck) {
  const ageMin = Math.floor((now - a.fetchedAt.getTime()) / 60000);
  const ageStr = ageMin < 60 ? `${ageMin}m` : `${Math.floor(ageMin / 60)}h${ageMin % 60}m`;
  const contentLen = a.content?.length ?? 0;
  // Crude speaker pull for Knesset rows — they prefix the body with
  // "SPEAKER:" or have the speaker in the title (e.g. "X | מליאה").
  let knessetSpeaker = "";
  if (a.source.includes("כנסת") && a.title) {
    knessetSpeaker = ` speaker="${a.title.split(/[|·:]/)[0].trim().slice(0, 40)}"`;
  }
  console.log(`[${ageStr}] ${a.source} · len=${contentLen}${knessetSpeaker}`);
  console.log(`  ${a.title.slice(0, 100)}`);
  console.log(`  ${a.url.slice(0, 100)}`);
  console.log();
}

await prisma.$disconnect();
