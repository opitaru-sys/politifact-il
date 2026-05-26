#!/usr/bin/env tsx
/**
 * Weekly: generate one AI-narrated insight per canonical topic.
 * Stored in TopicInsight (slug, weekOf, body). Topic page reads
 * these and falls back to the deterministic templates if missing.
 *
 * Idempotent via (slug, weekOf) unique constraint. Re-runs on the
 * same Friday just update the existing rows.
 *
 * Wired into .github/workflows/weekly-digest.yml so it runs alongside
 * the digest generation Friday morning.
 *
 * Cost: ~$0.01-0.03 per topic × 13 topics = ~$0.20/week.
 */
import { readFileSync } from "fs";

function forceLoadEnv(key: string): void {
  if (process.env[key] && process.env[key]!.length > 5) return;
  try {
    const content = readFileSync(".env.local", "utf8");
    const m = content.match(new RegExp(`^${key}=(.*)$`, "m"));
    if (m) {
      let val = m[1].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (val.length > 5) process.env[key] = val;
    }
  } catch {
    /* missing */
  }
}
forceLoadEnv("DATABASE_URL");
forceLoadEnv("GEMINI_API_KEY");

const { PrismaClient } = await import("@prisma/client");
const { listCanonicalTopics } = await import("../src/lib/topics");
const { synthesizeTopicInsight } = await import("../src/lib/topic-insight-synthesis");

const prisma = new PrismaClient();

function getLastFriday(): Date {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = (day - 5 + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(12, 0, 0, 0);
  return d;
}

function parseWeekOf(): Date {
  const idx = process.argv.indexOf("--week");
  if (idx >= 0 && process.argv[idx + 1]) {
    const d = new Date(process.argv[idx + 1]);
    if (!Number.isNaN(d.getTime())) {
      d.setUTCHours(12, 0, 0, 0);
      return d;
    }
  }
  return getLastFriday();
}

const APPLY = process.argv.includes("--apply");
const weekOf = parseWeekOf();

console.log(`Generating topic insights for week ending ${weekOf.toISOString().slice(0, 10)}`);

const topics = listCanonicalTopics();
console.log(`${topics.length} canonical topics to process\n`);

let written = 0;
let skipped = 0;
let failed = 0;

for (const t of topics) {
  process.stdout.write(`  ${t.slug.padEnd(18)} `);
  try {
    const body = await synthesizeTopicInsight(t.slug, t.label);
    if (!APPLY) {
      const preview = body.slice(0, 110).replace(/\s+/g, " ");
      console.log(`✓ generated (${body.length} chars)\n        ${preview}...`);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any).topicInsight.upsert({
        where: { slug_weekOf: { slug: t.slug, weekOf } },
        create: { slug: t.slug, weekOf, label: t.label, body },
        update: { label: t.label, body, generatedAt: new Date() },
      });
      console.log(`✓ written`);
    }
    written++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("No topic stats")) {
      console.log(`- skipped (no claims)`);
      skipped++;
    } else {
      console.log(`✗ failed: ${msg.slice(0, 80)}`);
      failed++;
    }
  }
}

console.log(`\nDone. ${APPLY ? "written" : "previewed"}=${written} skipped=${skipped} failed=${failed}`);
if (!APPLY) console.log(`Re-run with --apply to write to DB.`);
await prisma.$disconnect();
