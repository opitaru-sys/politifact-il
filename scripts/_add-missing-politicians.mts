#!/usr/bin/env tsx
/**
 * One-off: add Yair Golan to the politician table. Bennett already
 * exists in the DB; only NAME_TO_ID needed updating for him (done
 * in src/lib/rss-feeds.ts).
 *
 * Idempotent: re-running just upserts.
 */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();

const toAdd = [
  {
    id: "yair-golan",
    name: "יאיר גולן",
    party: "הדמוקרטים",
    role: null,
    image: null,
  },
];

for (const pol of toAdd) {
  const existing = await p.politician.findUnique({ where: { id: pol.id } });
  if (existing) {
    console.log(`✓ already exists: ${pol.id} (${existing.name}, ${existing.party})`);
    // Update party label in case it's been renamed externally
    if (existing.party !== pol.party || existing.name !== pol.name) {
      await p.politician.update({
        where: { id: pol.id },
        data: { name: pol.name, party: pol.party },
      });
      console.log(`  updated → ${pol.name} (${pol.party})`);
    }
    continue;
  }
  await p.politician.create({ data: pol });
  console.log(`+ added: ${pol.id} (${pol.name}, ${pol.party})`);
}

await p.$disconnect();
