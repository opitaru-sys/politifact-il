#!/usr/bin/env tsx
/** Print the latest digest's full content to verify AI output quality. */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();
const d = await p.digest.findFirst({ orderBy: { weekOf: "desc" } });
if (!d) {
  console.log("no digest");
  process.exit(0);
}
console.log(`# ${d.title}`);
console.log(`\n## פתיח\n${d.intro}`);
const sections = d.sections as { type: string; heading: string; body: string }[];
for (const s of sections) {
  console.log(`\n## [${s.type}] ${s.heading}\n${s.body}`);
}
await p.$disconnect();
