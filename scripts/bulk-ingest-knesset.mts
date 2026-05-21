#!/usr/bin/env tsx
/**
 * One-time bulk ingest of the last 30 Knesset plenary sessions to
 * backfill the daily claim distribution. The regular daily cron
 * fetches the last 5 sessions, which only covers ~1-2 weeks; this
 * goes back ~6 weeks.
 *
 * Each session typically yields 30-80 speaker-blocks → articles.
 * Then we drain the queue against Gemini for fact-checking.
 *
 * Cost estimate: 30 sessions × ~50 blocks/session = ~1500 articles,
 * yielding maybe 100-200 new claims at ~$0.02/claim = ~$3-4.
 */
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
const apiKey = env.match(/^GEMINI_API_KEY=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;
if (apiKey) process.env.GEMINI_API_KEY = apiKey;

if (!process.env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY not loaded");
  process.exit(1);
}

const { ingestKnessetPlenum } = await import("../src/lib/knesset-ingest");

console.log("[1/2] Ingesting last 30 Knesset plenum sessions...");
const t1 = Date.now();
const result = await ingestKnessetPlenum({ sessionLimit: 30 });
console.log(`  ${result.sessions} sessions / ${result.docs} docs / ${result.speeches} new speeches`);
console.log(`  ingest took ${Math.round((Date.now() - t1) / 1000)}s`);
