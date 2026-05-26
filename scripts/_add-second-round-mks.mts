#!/usr/bin/env tsx
/** Add the 2 MKs surfaced by the second-round audit (after web-research
 *  verification). Idempotent. */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;
const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();

const NEW_MKS = [
  { id: "shalom-danino", name: "שלום דנינו", party: "הליכוד" },
  { id: "tatiana-mazarsky", name: "טטיאנה מזרסקי", party: "יש עתיד" },
];

for (const mk of NEW_MKS) {
  const existing = await p.politician.findUnique({ where: { id: mk.id } });
  if (existing) {
    console.log(`✓ ${mk.id} already exists (${existing.name}, ${existing.party})`);
    continue;
  }
  await p.politician.create({
    data: { id: mk.id, name: mk.name, party: mk.party, role: null, image: null },
  });
  console.log(`+ added: ${mk.id} (${mk.name}, ${mk.party})`);
}

await p.$disconnect();
