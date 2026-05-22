#!/usr/bin/env tsx
/** Show recent non-Knesset claims with verdict + rejection reason. */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;
const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();
const cutoff = new Date();
cutoff.setHours(cutoff.getHours() - 36);
const claims = await p.claim.findMany({
  where: { createdAt: { gte: cutoff }, source: { not: "כנסת · מליאה" } },
  select: {
    quote: true,
    verdict: true,
    editorApproved: true,
    verifierNotes: true,
    source: true,
    confidence: true,
  },
  orderBy: { createdAt: "desc" },
});
console.log(`${claims.length} non-Knesset claims in last 36h\n`);
for (const c of claims) {
  console.log(`[${c.editorApproved ? "✓" : "✗"} ${c.verdict} conf=${c.confidence?.toFixed(2)}] (${c.source})`);
  console.log(`  ${c.quote.slice(0, 110)}`);
  if (c.verifierNotes) console.log(`  → ${c.verifierNotes}`);
  console.log();
}
await p.$disconnect();
