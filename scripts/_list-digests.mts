#!/usr/bin/env tsx
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;
const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();
const all = await p.digest.findMany({ select: { id: true, weekOf: true, status: true, title: true } });
for (const d of all) console.log(`${d.status.padEnd(10)} ${d.weekOf.toISOString().slice(0,10)} ${d.title}`);
await p.$disconnect();
