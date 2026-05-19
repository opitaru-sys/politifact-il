#!/usr/bin/env tsx
/**
 * Daily ingest + process job. Imports the same code paths the Next.js routes use.
 *
 * Run manually: npm run daily
 * Schedule on Windows (run once in elevated PowerShell):
 *   $action  = New-ScheduledTaskAction -Execute 'cmd.exe' `
 *               -Argument '/c npm run daily' `
 *               -WorkingDirectory 'C:\Users\User\Desktop\ISR Politicians Fact Check\badak'
 *   $trigger = New-ScheduledTaskTrigger -Daily -At 6:00am
 *   Register-ScheduledTask -TaskName 'BadukDailyIngest' -Action $action -Trigger $trigger
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

// Force-load env from .env.local because Windows system env can override with empty strings.
// (We hit this earlier — `ANTHROPIC_API_KEY=""` was set system-wide and silenced everything.)
function forceLoadEnv(key: string): void {
  if (process.env[key] && process.env[key]!.length > 5) return;
  for (const file of [".env.local", ".env"]) {
    try {
      const content = readFileSync(resolve(projectRoot, file), "utf8");
      const m = content.match(new RegExp(`^${key}=(.*)$`, "m"));
      if (m) {
        let val = m[1].trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.length > 5) {
          process.env[key] = val;
          return;
        }
      }
    } catch { /* file missing */ }
  }
}
forceLoadEnv("ANTHROPIC_API_KEY");
forceLoadEnv("DATABASE_URL");

const stamp = new Date().toISOString();
console.log(`[${stamp}] Daily run starting`);
console.log(`  CWD:           ${process.cwd()}`);
console.log(`  DATABASE_URL:  ${process.env.DATABASE_URL}`);
console.log(`  API key len:   ${process.env.ANTHROPIC_API_KEY?.length || 0}`);

if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.length < 10) {
  console.error("✗ ANTHROPIC_API_KEY not loaded. Check .env.local and KNOWN-ISSUES.md.");
  process.exit(1);
}

// Now safe to import the pipeline modules (they read env at import time)
const { fetchAllFeeds } = await import("../src/lib/ingest");
const { processUnprocessedArticles } = await import("../src/lib/fact-check");
const { ingestKnessetPlenum } = await import("../src/lib/knesset-ingest");

console.log("\n--- Ingesting RSS feeds ---");
const ingestResults = await fetchAllFeeds();
const totalFetched = ingestResults.reduce((s, r) => s + (r.fetched || 0), 0);
console.log(`Ingested ${totalFetched} new RSS articles`);
for (const r of ingestResults) {
  console.log(`  ${r.feed}: ${r.fetched}${r.error ? ` (error: ${r.error.slice(0, 80)})` : ""}`);
}

console.log("\n--- Ingesting Knesset plenary transcripts ---");
try {
  const knesset = await ingestKnessetPlenum({ knessetNum: 25, sessionLimit: 3 });
  console.log(`Knesset: ${knesset.sessions} sessions / ${knesset.docs} docs / ${knesset.speeches} new speeches`);
} catch (err) {
  console.error("Knesset ingest failed:", err);
}

console.log("\n--- Processing articles ---");
// Process up to 300 per run. RSS + Knesset can add 100-200 articles in a single
// daily fetch; 100 was too tight and caused backlog. 300 covers typical days
// with headroom. If queue still grows over time, run scripts/drain-queue.mts.
const claims = await processUnprocessedArticles(300);
console.log(`\nCreated ${claims.length} new claims`);

console.log(`\n[${new Date().toISOString()}] Daily run complete ✓`);
process.exit(0);
