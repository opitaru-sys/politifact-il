#!/usr/bin/env tsx
/**
 * After expanding NAME_TO_ID, find processed articles whose extracted
 * politicians now resolve (but didn't before) and reset them to
 * processed=false so the next cron picks them up. Or with --apply,
 * also kick the processing immediately.
 *
 * Scope: targets articles where any extracted politicianName matches
 * a name we JUST added to NAME_TO_ID. Bounded so we don't reprocess
 * the entire history.
 */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();

const APPLY = process.argv.includes("--apply");

// Names we just added to NAME_TO_ID. Articles with any of these in
// their extractedData are eligible for reprocessing.
const NEWLY_RESOLVABLE = [
  "יאיר גולן",
  "נפתלי בנט",
  "בנט",
  "יצחק שמעון וסרלאוף",
  "מירי מרים רגב",
  "אורית מלכה סטרוק",
  "צבי ידידיה סוכות",
  "שרן מרים השכל",
  "מיכל מרים וולדיגר",
  "מיכל וולדיגר",
  "קטי קטרין שטרית",
  "בנימין גנץ",
  "פנינה תמנו",
  "מאיר כהן",
  "מירב בן ארי",
  "יסמין פרידמן",
  "עדי עזוז",
  "ואליד אלהואשלה",
  "וליד אלהואשלה",
  "סימון דוידסון",
  "יצחק קרויזר",
  "נאור שירי",
  "שרון ניר",
  "רון כץ",
  "יאסר חוג'יראת",
  "יאסר חג'יראת",
];

// Substring search via OR. Postgres handles ~25 OR contains predicates
// fine; if this list grows much larger, consider a tsvector index.
const candidates = await p.article.findMany({
  where: {
    processed: true,
    OR: NEWLY_RESOLVABLE.map((name) => ({ extractedData: { contains: name } })),
  },
  select: { id: true, title: true, source: true, fetchedAt: true, extractedData: true },
});

console.log(`Candidate articles (already processed but with newly-resolvable names): ${candidates.length}`);

// Per-name breakdown
const byName = new Map<string, number>();
for (const c of candidates) {
  for (const name of NEWLY_RESOLVABLE) {
    if (c.extractedData && c.extractedData.includes(name)) {
      byName.set(name, (byName.get(name) ?? 0) + 1);
    }
  }
}
console.log(`\nMatch counts per newly-resolvable name:`);
for (const [n, count] of Array.from(byName.entries()).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(4)}  ${n}`);
}

if (!APPLY) {
  console.log(`\nDry-run. Re-run with --apply to reset processed=false on these articles.`);
  console.log(`The next fresh-process cron (every 2h at :15 UTC) will re-extract them.`);
  console.log(`Or trigger immediately with: npx tsx -e "(await import('./src/lib/fact-check')).processFreshNewsArticles(${candidates.length}, 24 * 30)"`);
  await p.$disconnect();
  process.exit(0);
}

const ids = candidates.map((c) => c.id);
const result = await p.article.updateMany({
  where: { id: { in: ids } },
  data: { processed: false, extractedData: null },
});
console.log(`\n✓ Reset ${result.count} articles to processed=false.`);
console.log(`Next fresh-process cron will pick them up. Or run processFreshNewsArticles manually.`);

await p.$disconnect();
