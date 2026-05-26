#!/usr/bin/env tsx
/**
 * Find + immediately process articles mentioning the 3 new MKs added
 * 2026-05-26 (Mati Tzarfati Harkabi, Michal Shir Segman, Samer Ben
 * Saeed) so their profiles populate right after the NAME_TO_ID fix
 * ships. Same pattern as _process-yair-and-bennett.mts.
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
const { processArticle } = await import("../src/lib/fact-check");
const p = new PrismaClient();

const TARGETS = [
  "מטי צרפתי הרכבי",
  "מטי הרכבי",
  "מיכל שיר סגמן",
  "מיכל שיר",
  "סמיר בן סעיד",
];

// Find articles that either still have the name in extractedData (was
// dropped) or mention the name in title/content (might never have been
// extracted). Reset processed=false on the already-processed ones.
const articles = await p.article.findMany({
  where: {
    OR: [
      ...TARGETS.map((t) => ({ extractedData: { contains: t } })),
      ...TARGETS.map((t) => ({ title: { contains: t } })),
      ...TARGETS.map((t) => ({ content: { contains: t } })),
    ],
  },
  orderBy: { fetchedAt: "desc" },
  select: { id: true, title: true, source: true, processed: true },
});

console.log(`Found ${articles.length} articles mentioning the 3 new MKs.\n`);

const toReset = articles.filter((a) => a.processed);
if (toReset.length > 0) {
  await p.article.updateMany({
    where: { id: { in: toReset.map((a) => a.id) } },
    data: { processed: false, extractedData: null },
  });
  console.log(`Reset ${toReset.length} processed articles → processed=false.`);
}

console.log(`\nProcessing ${articles.length} articles now:\n`);
let totalNew = 0;
for (const a of articles) {
  console.log(`  [${a.source}] ${a.title.slice(0, 80)}`);
  try {
    const claims = await processArticle(a.id);
    console.log(`    → ${claims.length} claims created`);
    totalNew += claims.length;
  } catch (err) {
    console.error(`    ✗ failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log(`\n✓ Total new claims: ${totalNew}\n`);

for (const id of ["mati-tzarfati-harkabi", "michal-shir-segman", "samer-ben-saeed"]) {
  const total = await p.claim.count({ where: { politicianId: id, status: "published" } });
  const approved = await p.claim.count({ where: { politicianId: id, status: "published", editorApproved: true } });
  console.log(`  ${id}: ${total} published, ${approved} approved`);
}

await p.$disconnect();
