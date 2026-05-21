#!/usr/bin/env tsx
// Audit which politicians on the leaderboard have working image paths
// vs which ones are showing broken-image placeholders on the site.
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();

const all = await p.politician.findMany({
  where: { claims: { some: { editorApproved: true, status: "published" } } },
  select: {
    id: true,
    name: true,
    image: true,
    _count: { select: { claims: { where: { editorApproved: true, status: "published" } } } },
  },
  orderBy: { name: "asc" },
});

console.log(`${all.length} politicians with at least 1 approved claim:\n`);
const missing: { id: string; name: string; image: string | null }[] = [];

for (const x of all) {
  // image is stored as e.g. "/politicians/ben-gvir.jpg" — check if the file exists.
  let fileExists = false;
  if (x.image) {
    const filePath = resolve("public", x.image.replace(/^\//, ""));
    fileExists = existsSync(filePath);
  }
  const status = !x.image
    ? "✗ NO IMG SET"
    : fileExists
    ? "✓"
    : `✗ MISSING FILE (${x.image})`;
  console.log(`${status} ${x.name} (${x._count.claims} claims)`);
  if (!x.image || !fileExists) missing.push({ id: x.id, name: x.name, image: x.image });
}

console.log(`\n${missing.length} politicians need image fixes:`);
for (const m of missing) {
  console.log(`  ${m.id} — ${m.name} (current: ${m.image ?? "null"})`);
}

await p.$disconnect();
