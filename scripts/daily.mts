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
// (We hit this earlier — `GEMINI_API_KEY=""` was set system-wide and silenced everything.)
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
forceLoadEnv("GEMINI_API_KEY");
forceLoadEnv("DATABASE_URL");

const stamp = new Date().toISOString();
console.log(`[${stamp}] Daily run starting`);
console.log(`  CWD:           ${process.cwd()}`);
console.log(`  DATABASE_URL:  ${process.env.DATABASE_URL}`);
console.log(`  API key len:   ${process.env.GEMINI_API_KEY?.length || 0}`);

if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.length < 10) {
  console.error("✗ GEMINI_API_KEY not loaded. Check .env.local and KNOWN-ISSUES.md.");
  process.exit(1);
}

// Now safe to import the pipeline modules (they read env at import time)
const { fetchAllFeeds } = await import("../src/lib/ingest");
const {
  processFreshNewsArticles,
  processKnessetBacklog,
  processUnprocessedArticles,
} = await import("../src/lib/fact-check");
const { ingestKnessetPlenum } = await import("../src/lib/knesset-ingest");

console.log("\n--- Ingesting RSS feeds ---");
const ingestResults = await fetchAllFeeds();
const totalFetched = ingestResults.reduce((s, r) => s + (r.fetched || 0), 0);
console.log(`Ingested ${totalFetched} new RSS articles`);
for (const r of ingestResults) {
  console.log(`  ${r.feed}: ${r.fetched}${r.error ? ` (error: ${r.error.slice(0, 80)})` : ""}`);
}

console.log("\n--- Processing fresh RSS news first ---");
// Fresh news is the public SLA. Process recently fetched RSS items newest
// first before touching the Knesset/backfill corpus, so a transcript dump
// can never starve today's news cycle.
const freshLimit = Number(process.env.BADAK_FRESH_NEWS_LIMIT ?? 80);
const freshHours = Number(process.env.BADAK_FRESH_NEWS_HOURS ?? 48);
const freshClaims = await processFreshNewsArticles(freshLimit, freshHours);
console.log(`Fresh news created ${freshClaims.length} new claims`);

console.log("\n--- Ingesting Knesset plenary transcripts ---");
try {
  const knesset = await ingestKnessetPlenum({ knessetNum: 25, sessionLimit: 3 });
  console.log(`Knesset: ${knesset.sessions} sessions / ${knesset.docs} docs / ${knesset.speeches} new speeches`);
} catch (err) {
  console.error("Knesset ingest failed:", err);
}

console.log("\n--- Processing older RSS backlog ---");
// Small non-Knesset catch-up lane. This keeps older news moving without
// letting it consume the whole run.
const rssBacklogLimit = Number(process.env.BADAK_RSS_BACKLOG_LIMIT ?? 20);
const rssBacklogClaims = await processUnprocessedArticles({
  limit: rssBacklogLimit,
  excludeSources: ["כנסת · מליאה"],
  order: "oldest",
});
console.log(`RSS backlog created ${rssBacklogClaims.length} new claims`);

console.log("\n--- Processing Knesset backlog (low budget) ---");
// Knesset transcripts are valuable, but they are the main backlog source.
// Keep them on a tiny daily budget so they drain slowly without blocking
// fresh public news.
const previousDisableGrounding = process.env.BADAK_DISABLE_GROUNDING;
process.env.BADAK_DISABLE_GROUNDING = process.env.BADAK_KNESSET_DISABLE_GROUNDING ?? "1";
const knessetLimit = Number(process.env.BADAK_KNESSET_DAILY_LIMIT ?? 5);
const knessetClaims = await processKnessetBacklog(knessetLimit);
if (previousDisableGrounding === undefined) delete process.env.BADAK_DISABLE_GROUNDING;
else process.env.BADAK_DISABLE_GROUNDING = previousDisableGrounding;
console.log(`Knesset backlog created ${knessetClaims.length} new claims`);

const totalClaims = freshClaims.length + rssBacklogClaims.length + knessetClaims.length;
console.log(`\nCreated ${totalClaims} new claims`);

// Record today's metrics in DailySnapshot so the admin dashboard's
// history chart has a fresh row. Idempotent — re-runs the same day
// just update the existing row. Inlined here (rather than importing
// scripts/snapshot.mts) to avoid TypeScript's .mts import-extension
// restriction.
try {
  const day = new Date().toISOString().slice(0, 10);
  const { PrismaClient: PC } = await import("@prisma/client");
  const p2 = new PC();
  const [totalC, publishedC, editorC, totalA, queueD, lastC] = await Promise.all([
    p2.claim.count(),
    p2.claim.count({ where: { status: "published" } }),
    p2.claim.count({ where: { editorApproved: true } }),
    p2.article.count(),
    p2.article.count({ where: { processed: false } }),
    p2.claim.findFirst({
      where: { status: "published" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);
  const data = {
    totalClaims: totalC,
    publishedClaims: publishedC,
    editorApproved: editorC,
    totalArticles: totalA,
    queueDepth: queueD,
    lastClaimAt: lastC?.createdAt ?? null,
  };
  await p2.dailySnapshot.upsert({
    where: { day },
    create: { day, ...data },
    update: data,
  });
  console.log(`Snapshot ${day}: ${editorC}/${publishedC} approved, queue=${queueD}`);
  await p2.$disconnect();
} catch (err) {
  console.error("Snapshot write failed:", err);
}

console.log(`\n[${new Date().toISOString()}] Daily run complete ✓`);
process.exit(0);
