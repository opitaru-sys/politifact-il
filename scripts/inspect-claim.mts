#!/usr/bin/env tsx
/** Look up claims by politician + quote substring + see their approval status. */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();

const politicianId = process.argv[2] ?? "may-golan";
const claims = await p.claim.findMany({
  where: { politicianId },
  orderBy: { createdAt: "desc" },
  take: 15,
  select: {
    id: true,
    quote: true,
    verdict: true,
    summary: true,
    status: true,
    editorApproved: true,
    verifierNotes: true,
    confidence: true,
    createdAt: true,
    source: true,
  },
});

console.log(`${claims.length} claims for ${politicianId}:\n`);
for (const c of claims) {
  const flag = c.editorApproved ? "✓ visible" : "✗ HIDDEN";
  console.log(`[${flag}] ${c.verdict} conf=${c.confidence?.toFixed(2)} (${c.source})`);
  console.log(`  ${c.quote.slice(0, 100)}`);
  console.log(`  status=${c.status} · ${c.createdAt.toISOString().slice(0, 16)}`);
  if (c.verifierNotes) console.log(`  notes: ${c.verifierNotes}`);
  console.log();
}
await p.$disconnect();
