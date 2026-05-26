#!/usr/bin/env tsx
/** One-shot audit — count broader mentions of potentially-stale officeholders
 *  in approved-claim explanations, to see if the sweep regex is too narrow. */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const claims = await prisma.claim.findMany({
  where: { status: "published", editorApproved: true },
  select: { id: true, politicianId: true, quote: true, explanation: true },
});

const probes = [
  { name: "all 'גלנט' contexts (need manual review)", re: /גלנט/ },
  { name: "all 'הרצי הלוי' contexts (need manual review)", re: /הרצי\s+הלוי/ },
];

for (const p of probes) {
  const hits = claims.filter((c) => p.re.test(c.explanation));
  console.log(`\n=== ${hits.length}x  ${p.name} ===`);
  for (const h of hits) {
    const m = h.explanation.match(p.re);
    const idx = m?.index ?? 0;
    const snip = h.explanation.slice(Math.max(0, idx - 80), idx + 200);
    console.log(`\n  ${h.politicianId} (${h.id}):`);
    console.log(`    ...${snip}...`);
  }
}

await prisma.$disconnect();
