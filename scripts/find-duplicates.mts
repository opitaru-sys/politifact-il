#!/usr/bin/env tsx
/**
 * Find near-duplicate claims within each politician's set. Uses the same
 * normalized-Hebrew Jaccard similarity that the live dedup gate uses,
 * but reports pairs at a lower threshold so we can see what's slipping
 * through and what the threshold should be.
 */
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

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

const politicianId = process.argv[2];
const threshold = parseFloat(process.argv[3] ?? "0.3");

if (!politicianId) {
  // Summary: top 10 politicians by claim count, with their near-dup count.
  const groups = await prisma.claim.groupBy({
    by: ["politicianId"],
    where: { status: "published" },
    _count: true,
    orderBy: { _count: { politicianId: "desc" } },
    take: 10,
  });
  for (const g of groups) {
    const politician = await prisma.politician.findUnique({ where: { id: g.politicianId } });
    if (!politician) continue;
    const claims = await prisma.claim.findMany({
      where: { politicianId: g.politicianId, status: "published" },
      select: { id: true, quote: true },
    });
    const norms = claims.map((c) => ({ ...c, n: normalizeHebrew(c.quote) }));
    let pairs = 0;
    for (let i = 0; i < norms.length; i++) {
      for (let j = i + 1; j < norms.length; j++) {
        if (similarity(norms[i].n, norms[j].n) >= threshold) pairs++;
      }
    }
    console.log(`${politician.name}: ${g._count} claims, ${pairs} near-dup pairs ≥${threshold}`);
  }
} else {
  // Detail: dump all near-dup pairs for one politician.
  const claims = await prisma.claim.findMany({
    where: { politicianId, status: "published" },
    select: { id: true, quote: true, source: true, verdict: true, editorApproved: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`${claims.length} claims for ${politicianId}\n`);
  const norms = claims.map((c) => ({ ...c, n: normalizeHebrew(c.quote) }));
  for (let i = 0; i < norms.length; i++) {
    for (let j = i + 1; j < norms.length; j++) {
      const s = similarity(norms[i].n, norms[j].n);
      if (s >= threshold) {
        console.log(`sim=${s.toFixed(2)}`);
        console.log(`  A [${norms[i].id}] ${norms[i].editorApproved ? "✓" : "✗"} ${norms[i].source}: ${norms[i].quote.slice(0, 100)}`);
        console.log(`  B [${norms[j].id}] ${norms[j].editorApproved ? "✓" : "✗"} ${norms[j].source}: ${norms[j].quote.slice(0, 100)}`);
        console.log();
      }
    }
  }
}

await prisma.$disconnect();
