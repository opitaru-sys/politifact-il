#!/usr/bin/env tsx
/**
 * CLI wrapper for `ingestKnessetActivity()`. Also called from
 * `scripts/daily.mts` as the last lane in the daily pipeline.
 *
 * Standalone usage (for testing / one-off):
 *   npx tsx scripts/ingest-knesset-activity.mts
 *
 * Idempotent — re-running on the same day just refreshes the rows.
 */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { ingestKnessetActivity } = await import("../src/lib/knesset-activity.js");
const summary = await ingestKnessetActivity();
console.log("\n=== Summary ===");
console.log(`Matched MKs: ${summary.matched}`);
console.log(`Rows updated: ${summary.updated}`);
console.log(`Window: ${summary.windowStart.toISOString().slice(0, 10)} → ${summary.windowEnd.toISOString().slice(0, 10)}`);

process.exit(0);
