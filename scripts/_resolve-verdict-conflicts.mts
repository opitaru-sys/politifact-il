#!/usr/bin/env tsx
/** Resolve near-duplicate claims for the same politician with conflicting
 *  verdicts. Picks one "winner" per cluster and hides the others with a
 *  correctionNote pointing at the winner.
 *
 *  These exist because of a race in processArticle: isDuplicate() ran
 *  before the ~10s grounded fact-check, so two articles with the same
 *  quote both passed the check and both inserted with non-deterministic
 *  verdicts. The race is now closed (re-check before insert), but the
 *  existing cluster needs manual cleanup.
 *
 *  Conservative threshold: similarity >= 0.85 OR exact normalized match.
 *  Lower thresholds (0.55) hit false positives — distinct claims that
 *  happen to share a topic keyword like "קיצוץ" but address different
 *  budget areas.
 *
 *  Winner heuristic: most recent first, then highest verifier confidence.
 *  Note that "most recent" is by createdAt, not date, because the date
 *  field is the article's publishedAt which races have identical. */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;
const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const THRESHOLD = 0.85;

/** Cleanup-only normalization. Differs from the runtime one in
 *  src/lib/fact-check.ts: we KEEP digits + Latin letters so quotes
 *  that differ only in a year ("ב-2023" vs "ב-2024") or are entirely
 *  in English don't collapse to the same empty/identical normalized
 *  form. The runtime version is more aggressive because it runs before
 *  fact-check; the cleanup needs higher precision. */
function normalize(s: string): string {
  return s
    .replace(/[֑-ׇ]/g, "")              // strip niqqud
    .replace(/[^\p{L}\p{N}\s]/gu, " ")  // strip punctuation, keep letters + numbers
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function jaccard(a: string, b: string): number {
  if (!a || !b) return 0;
  const wa = new Set(a.split(" ").filter((w) => w.length > 2));
  const wb = new Set(b.split(" ").filter((w) => w.length > 2));
  // Need a meaningful overlap to call this a duplicate — empty or tiny
  // word-sets can match each other by accident (e.g. two short English
  // quotes that share only "the" / "and").
  if (wa.size < 4 || wb.size < 4) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / (wa.size + wb.size - inter);
}

type Row = {
  id: string;
  politicianId: string;
  quote: string;
  verdict: string;
  editorApproved: boolean;
  confidence: number | null;
  date: Date;
  createdAt: Date;
  correctionNote: string | null;
};

// Pull every live published claim from the last 180 days. (Older claims
// are unlikely to be involved in current race-condition issues.)
const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - 180);

const rows: Row[] = await p.claim.findMany({
  where: {
    status: "published",
    editorApproved: true,
    date: { gte: cutoff },
    correctionNote: null, // skip already-corrected rows
  },
  select: {
    id: true,
    politicianId: true,
    quote: true,
    verdict: true,
    editorApproved: true,
    confidence: true,
    date: true,
    createdAt: true,
    correctionNote: true,
  },
});

console.log(`Scanning ${rows.length} live claims from last 180 days for verdict conflicts (threshold ${THRESHOLD})...`);

// Bucket by politicianId so we only compare within a politician's own
// statements. O(rows²) within bucket but each bucket is small (~few hundred).
const byPol = new Map<string, Row[]>();
for (const r of rows) {
  if (!byPol.has(r.politicianId)) byPol.set(r.politicianId, []);
  byPol.get(r.politicianId)!.push(r);
}

type Cluster = { winner: Row; losers: Row[] };
const clusters: Cluster[] = [];
const seen = new Set<string>();

for (const polRows of byPol.values()) {
  // Pre-normalize once for speed.
  const norm = polRows.map((r) => ({ row: r, n: normalize(r.quote) }));
  for (let i = 0; i < norm.length; i++) {
    if (seen.has(norm[i].row.id)) continue;
    const group: Row[] = [norm[i].row];
    for (let j = i + 1; j < norm.length; j++) {
      if (seen.has(norm[j].row.id)) continue;
      const sim = norm[i].n === norm[j].n ? 1 : jaccard(norm[i].n, norm[j].n);
      if (sim >= THRESHOLD) group.push(norm[j].row);
    }
    if (group.length < 2) continue;
    // Only flag as conflict if there's verdict disagreement.
    const verdicts = new Set(group.map((g) => g.verdict));
    if (verdicts.size < 2) continue;
    // Pick winner: most recent createdAt → highest confidence as tiebreak.
    group.sort((a, b) => {
      const dt = b.createdAt.getTime() - a.createdAt.getTime();
      if (dt !== 0) return dt;
      return (b.confidence ?? 0) - (a.confidence ?? 0);
    });
    const [winner, ...losers] = group;
    clusters.push({ winner, losers });
    for (const g of group) seen.add(g.id);
  }
}

console.log(`Found ${clusters.length} conflict clusters with ${clusters.reduce((s, c) => s + c.losers.length, 0)} losers to hide.\n`);

for (const c of clusters) {
  console.log(`--- ${c.winner.politicianId} ---`);
  console.log(`  WIN ${c.winner.verdict.padEnd(10)} ${c.winner.id} (${c.winner.createdAt.toISOString()})`);
  console.log(`       "${c.winner.quote.slice(0, 90)}"`);
  for (const l of c.losers) {
    console.log(`  hide ${l.verdict.padEnd(10)} ${l.id} (${l.createdAt.toISOString()})`);
    console.log(`       "${l.quote.slice(0, 90)}"`);
  }
}

if (APPLY) {
  for (const c of clusters) {
    for (const l of c.losers) {
      await p.claim.update({
        where: { id: l.id },
        data: {
          editorApproved: false,
          correctionNote: `כפילות. הפסק הסופי לטענה זו (${c.winner.verdict}) נמצא בכתובת /claim/${c.winner.id}.`,
          correctedAt: new Date(),
        },
      });
    }
  }
  console.log(`\nHidden ${clusters.reduce((s, c) => s + c.losers.length, 0)} duplicate claims.`);
} else {
  console.log(`\nDry run. --apply to commit.`);
}

await p.$disconnect();
