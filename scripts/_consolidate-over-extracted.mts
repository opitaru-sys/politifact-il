#!/usr/bin/env tsx
/** Hide claims beyond top 2 per source URL per politician. A single long
 *  speech / Telegram post often produces 5-7 mini-claims that artificially
 *  inflate the politician's volume + dilute their Wilson score. Keep the
 *  2 most substantive (by quote length), hide the rest with a
 *  correctionNote explaining the consolidation.
 *
 *  Conservative: only acts on groups with > 2 claims from the same
 *  sourceUrl on the same politician. Articles that legitimately yielded
 *  2-or-fewer claims are left alone. */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;
const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const KEEP_PER_SOURCE = 2;

const allRows = await p.claim.findMany({
  where: {
    status: "published",
    editorApproved: true,
  },
  select: {
    id: true,
    politicianId: true,
    politician: { select: { name: true } },
    quote: true,
    verdict: true,
    sourceUrl: true,
    correctionNote: true,
    date: true,
    createdAt: true,
  },
});
// JS-side filter — Prisma 5.22 in this project doesn't accept null in NOT
// for whatever reason, and the dataset is small enough to filter in memory.
const rows = allRows.filter((c) => c.sourceUrl !== null && c.correctionNote === null);

console.log(`Scanning ${rows.length} live claims with a sourceUrl (of ${allRows.length} total live)...`);

// Group by (politicianId, sourceUrl)
type Row = typeof rows[number];
const groups = new Map<string, Row[]>();
for (const c of rows) {
  const key = `${c.politicianId}::${c.sourceUrl}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key)!.push(c);
}

// Only act on groups with > KEEP_PER_SOURCE claims
const offenders = [...groups.entries()].filter(([, arr]) => arr.length > KEEP_PER_SOURCE);
console.log(`${offenders.length} (politician, sourceUrl) groups have > ${KEEP_PER_SOURCE} claims.`);
const totalToHide = offenders.reduce((s, [, arr]) => s + (arr.length - KEEP_PER_SOURCE), 0);
console.log(`Would hide ${totalToHide} excess claims (keeping ${KEEP_PER_SOURCE} per group).\n`);

let hidden = 0;
for (const [key, arr] of offenders) {
  // Sort by quote length descending (longest = most substantive). Tiebreak
  // by createdAt ascending (older first = more stable choice).
  const sorted = [...arr].sort((a, b) => {
    if (b.quote.length !== a.quote.length) return b.quote.length - a.quote.length;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  const keepers = sorted.slice(0, KEEP_PER_SOURCE);
  const losers = sorted.slice(KEEP_PER_SOURCE);
  const [polId] = key.split("::");
  const polName = arr[0].politician.name;

  console.log(`--- ${polName} (${polId}) | ${arr.length} claims from one source ---`);
  console.log(`  Keep (${keepers.length}):`);
  for (const c of keepers) {
    console.log(`    [${c.verdict.padEnd(10)}] ${c.id} (${c.quote.length}c) ${c.quote.slice(0, 80)}`);
  }
  console.log(`  Hide (${losers.length}):`);
  for (const c of losers) {
    console.log(`    [${c.verdict.padEnd(10)}] ${c.id} (${c.quote.length}c) ${c.quote.slice(0, 80)}`);
    if (APPLY) {
      const keeperIds = keepers.map((k) => k.id).join(", ");
      await p.claim.update({
        where: { id: c.id },
        data: {
          editorApproved: false,
          correctionNote: `הוסר עקב מיזוג: הציטוט הוא חלק מאמירה ארוכה יותר שממנה חולצו ${arr.length} טענות נפרדות. כדי לא לנפח את כמות הטענות של הפוליטיקאי, נשמרו ${KEEP_PER_SOURCE} הציטוטים הכי מהותיים מאותו מקור (id ${keeperIds}), והשאר הוסרו.`,
          correctedAt: new Date(),
        },
      });
      hidden++;
    }
  }
}

console.log(`\n${APPLY ? hidden : 0} hidden of ${totalToHide} candidates.`);
if (!APPLY) console.log("Dry run. --apply to commit.");
await p.$disconnect();
