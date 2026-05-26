#!/usr/bin/env tsx
/**
 * Trigger immediate processing of articles that mention Yair Golan or
 * Bennett, so their profiles aren't empty when the user looks right
 * after the NAME_TO_ID fix ships. The rest of the 316 reset articles
 * drain via the regular cron.
 *
 * Uses the full pipeline including grounded fact-check (these are
 * recent news, grounding matters).
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

const TARGETS = ["יאיר גולן", "נפתלי בנט"];
// Note: "בנט" alone would match too many things (e.g. names containing
// בנט-something). Match only on full names to be conservative.

const articles = await p.article.findMany({
  where: {
    processed: false,
    OR: [
      ...TARGETS.map((t) => ({ title: { contains: t } })),
      ...TARGETS.map((t) => ({ content: { contains: t } })),
    ],
  },
  orderBy: { fetchedAt: "desc" },
  select: { id: true, title: true, source: true },
});

console.log(`Processing ${articles.length} articles mentioning Yair Golan or Bennett:\n`);

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

console.log(`\n✓ Total new claims: ${totalNew}`);

// Confirm coverage
for (const id of ["yair-golan", "bennett"]) {
  const count = await p.claim.count({ where: { politicianId: id, status: "published" } });
  const approved = await p.claim.count({ where: { politicianId: id, status: "published", editorApproved: true } });
  console.log(`  ${id}: ${count} published claims, ${approved} approved`);
}

await p.$disconnect();
