#!/usr/bin/env tsx
/**
 * Why aren't the most recent days showing up? Inspects:
 *  - Latest claim created (regardless of date field)
 *  - Latest article fetched
 *  - Latest article's publishedAt
 *  - Article counts by day for the last 7 days
 *  - Claim counts by day for the last 7 days
 */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();

const [lastClaim, lastArticle] = await Promise.all([
  p.claim.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, date: true, source: true, editorApproved: true, status: true, quote: true },
  }),
  p.article.findFirst({
    orderBy: { fetchedAt: "desc" },
    select: { id: true, title: true, source: true, fetchedAt: true, publishedAt: true, processed: true },
  }),
]);

console.log("=== Latest claim (any status, any approval) ===");
if (lastClaim) {
  console.log(`  id:        ${lastClaim.id}`);
  console.log(`  createdAt: ${lastClaim.createdAt.toISOString()}`);
  console.log(`  date:      ${lastClaim.date.toISOString()}`);
  console.log(`  source:    ${lastClaim.source}`);
  console.log(`  status:    ${lastClaim.status} ${lastClaim.editorApproved ? "(approved)" : "(rejected)"}`);
  console.log(`  quote:     ${lastClaim.quote.slice(0, 80)}...`);
}

console.log("\n=== Latest article fetched ===");
if (lastArticle) {
  console.log(`  source:      ${lastArticle.source}`);
  console.log(`  fetchedAt:   ${lastArticle.fetchedAt.toISOString()}`);
  console.log(`  publishedAt: ${lastArticle.publishedAt?.toISOString() ?? "(null)"}`);
  console.log(`  processed:   ${lastArticle.processed}`);
  console.log(`  title:       ${lastArticle.title.slice(0, 80)}`);
}

console.log("\n=== Articles fetched, last 7 days (by fetchedAt date) ===");
const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - 7);
const recentArts = await p.article.findMany({
  where: { fetchedAt: { gte: cutoff } },
  select: { fetchedAt: true, source: true, processed: true },
});
const byDay: Record<string, { total: number; processed: number; bySource: Record<string, number> }> = {};
for (const a of recentArts) {
  const d = a.fetchedAt.toISOString().slice(0, 10);
  if (!byDay[d]) byDay[d] = { total: 0, processed: 0, bySource: {} };
  byDay[d].total++;
  if (a.processed) byDay[d].processed++;
  byDay[d].bySource[a.source] = (byDay[d].bySource[a.source] ?? 0) + 1;
}
for (const d of Object.keys(byDay).sort()) {
  const r = byDay[d];
  const top = Object.entries(r.bySource).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s, c]) => `${s}=${c}`).join(", ");
  console.log(`  ${d}: ${r.total} (${r.processed} processed) — ${top}`);
}

console.log("\n=== Claims created, last 7 days (by createdAt) ===");
const recentClaims = await p.claim.findMany({
  where: { createdAt: { gte: cutoff } },
  select: { createdAt: true, date: true, source: true, editorApproved: true },
});
const claimsByDay: Record<string, { created: number; approved: number; rssCreated: number; rssApproved: number }> = {};
for (const c of recentClaims) {
  const d = c.createdAt.toISOString().slice(0, 10);
  if (!claimsByDay[d]) claimsByDay[d] = { created: 0, approved: 0, rssCreated: 0, rssApproved: 0 };
  claimsByDay[d].created++;
  if (c.editorApproved) claimsByDay[d].approved++;
  if (c.source !== "כנסת · מליאה") {
    claimsByDay[d].rssCreated++;
    if (c.editorApproved) claimsByDay[d].rssApproved++;
  }
}
for (const d of Object.keys(claimsByDay).sort()) {
  const r = claimsByDay[d];
  console.log(`  ${d}: ${r.created} created (${r.approved} approved) · RSS-only: ${r.rssCreated} created (${r.rssApproved} approved)`);
}

await p.$disconnect();
