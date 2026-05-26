#!/usr/bin/env tsx
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;
const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();
const all = await p.politician.findMany({ select: { id: true, name: true, party: true }, orderBy: { name: "asc" } });
for (const x of all) console.log(`${x.id.padEnd(30)} ${x.name.padEnd(25)} ${x.party}`);
console.log(`\ntotal: ${all.length}`);
await p.$disconnect();
