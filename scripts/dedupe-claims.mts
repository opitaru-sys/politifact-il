#!/usr/bin/env tsx
/**
 * Remove duplicate claims that slipped past the live dedup gate.
 *
 * Strategy per politician:
 *   1. Normalize every claim's quote (strip niqqud + punctuation).
 *   2. Group by similarity ≥ THRESHOLD (default 0.7).
 *   3. From each cluster, keep ONE survivor and delete the rest.
 *      Survivor preference order:
 *        a. editorApproved = true beats editorApproved = false
 *        b. Higher confidence beats lower
 *        c. Earlier createdAt beats later (oldest wins on ties)
 *      Comments + reports on the deleted claims are dropped (they were
 *      against the duplicate, not the canonical claim).
 *
 * Pass `--dry-run` to print the plan without touching the DB.
 */
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const THRESHOLD = 0.7;
const DRY_RUN = process.argv.includes("--dry-run");

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

function normalizeHebrew(s: string): string {
  return s
    .replace(/[֑-ׇ]/g, "")
    .replace(/[^א-ת\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const wordsA = new Set(a.split(" ").filter((w) => w.length > 2));
  const wordsB = new Set(b.split(" ").filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersect = 0;
  for (const w of wordsA) if (wordsB.has(w)) intersect++;
  return intersect / (wordsA.size + wordsB.size - intersect);
}

// Survivor priority: (approved desc, confidence desc, createdAt asc).
function bestOf<T extends { editorApproved: boolean; confidence: number | null; createdAt: Date }>(
  claims: T[],
): T {
  return claims.slice().sort((a, b) => {
    if (a.editorApproved !== b.editorApproved) return a.editorApproved ? -1 : 1;
    const ac = a.confidence ?? 0;
    const bc = b.confidence ?? 0;
    if (ac !== bc) return bc - ac;
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0];
}

const politicians = await prisma.politician.findMany({
  where: { claims: { some: { status: "published" } } },
  select: {
    id: true,
    name: true,
    claims: {
      where: { status: "published" },
      select: {
        id: true,
        quote: true,
        editorApproved: true,
        confidence: true,
        createdAt: true,
      },
    },
  },
});

let totalClusters = 0;
let totalDeleted = 0;

for (const p of politicians) {
  if (p.claims.length < 2) continue;

  const claimsWithNorm = p.claims.map((c) => ({ ...c, n: normalizeHebrew(c.quote) }));
  const used = new Set<string>();
  const clusters: typeof claimsWithNorm[] = [];

  for (let i = 0; i < claimsWithNorm.length; i++) {
    if (used.has(claimsWithNorm[i].id)) continue;
    const cluster = [claimsWithNorm[i]];
    used.add(claimsWithNorm[i].id);
    for (let j = i + 1; j < claimsWithNorm.length; j++) {
      if (used.has(claimsWithNorm[j].id)) continue;
      if (similarity(claimsWithNorm[i].n, claimsWithNorm[j].n) >= THRESHOLD) {
        cluster.push(claimsWithNorm[j]);
        used.add(claimsWithNorm[j].id);
      }
    }
    if (cluster.length > 1) clusters.push(cluster);
  }

  if (clusters.length === 0) continue;

  console.log(`\n${p.name} — ${clusters.length} duplicate cluster${clusters.length === 1 ? "" : "s"}:`);
  for (const cluster of clusters) {
    const survivor = bestOf(cluster);
    const toDelete = cluster.filter((c) => c.id !== survivor.id);
    totalClusters++;
    totalDeleted += toDelete.length;
    console.log(`  cluster of ${cluster.length}: keep [${survivor.id.slice(-8)}] (${survivor.editorApproved ? "✓" : "✗"} conf=${survivor.confidence?.toFixed(2)})`);
    console.log(`    "${survivor.quote.slice(0, 80)}..."`);
    for (const d of toDelete) {
      console.log(`  → delete [${d.id.slice(-8)}] (${d.editorApproved ? "✓" : "✗"} conf=${d.confidence?.toFixed(2)})`);
    }

    if (!DRY_RUN) {
      const ids = toDelete.map((d) => d.id);
      await prisma.comment.deleteMany({ where: { claimId: { in: ids } } });
      await prisma.report.deleteMany({ where: { claimId: { in: ids } } });
      await prisma.claim.deleteMany({ where: { id: { in: ids } } });
    }
  }
}

console.log(`\n--- Summary ---`);
console.log(`Clusters found: ${totalClusters}`);
console.log(`Claims ${DRY_RUN ? "WOULD BE " : ""}deleted: ${totalDeleted}`);
if (DRY_RUN) console.log("(--dry-run — no changes written. Re-run without the flag to commit.)");

await prisma.$disconnect();
