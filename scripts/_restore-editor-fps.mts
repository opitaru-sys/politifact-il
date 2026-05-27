#!/usr/bin/env tsx
/** Restore claims rejected by the first run of apply-editorial-review with the
 *  new categories. Several were false positives on category 9 (retroactive):
 *  the editor over-applied it to historical facts, future-tense actions,
 *  recurring events, and "today is N days since Oct 7" date counts. Restore
 *  them so we can re-run with a tightened prompt. */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;
const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();

const APPLY = process.argv.includes("--apply");

// Pull every claim un-approved by the editor in the last 30 minutes.
const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
const rows = await p.claim.findMany({
  where: {
    editorApproved: false,
    correctedAt: { gte: thirtyMinAgo },
    verifierNotes: { startsWith: "[עורך]" },
  },
  select: {
    id: true,
    quote: true,
    verdict: true,
    politician: { select: { name: true } },
    verifierNotes: true,
    correctionNote: true,
  },
  orderBy: { correctedAt: "desc" },
});

console.log(`Found ${rows.length} editor-rejected claims in last 30 min`);
console.log("");

for (const c of rows) {
  console.log(`  ${c.politician.name} · ${c.verdict}`);
  console.log(`    quote: ${c.quote.slice(0, 100)}`);
  console.log(`    note:  ${(c.correctionNote ?? "").slice(0, 200)}`);
  console.log("");
  if (APPLY) {
    await p.claim.update({
      where: { id: c.id },
      data: {
        editorApproved: true,
        correctionNote: null,
        correctedAt: null,
        verifierNotes: null,
      },
    });
  }
}

if (APPLY) console.log(`Restored ${rows.length} claims.`);
else console.log(`Dry run. --apply to restore.`);
await p.$disconnect();
