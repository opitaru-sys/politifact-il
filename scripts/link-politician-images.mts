#!/usr/bin/env tsx
/**
 * Populate Politician.image for every politician where a matching file
 * exists in public/politicians/<id>.jpg.
 *
 * Background: politicians get inserted into the DB when claims about
 * them are extracted. The NAME_TO_ID map in src/lib/rss-feeds.ts says
 * what their stable `id` is. We don't have a step that ever sets their
 * `image` field — that was supposed to be done at seed time but only
 * 8 politicians ever got seeded with images (the ones in mock.ts).
 * Everyone else has image: null and shows a broken-image placeholder.
 *
 * This script fixes the easy half: politicians whose ID matches a file
 * on disk. For the rest, the file doesn't exist yet — sourcing those
 * images is a separate task (see BACKLOG.md).
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

// Get every politician in the DB (not just ones with claims — the avatar
// might be needed elsewhere too).
const all = await prisma.politician.findMany({
  select: { id: true, name: true, image: true },
});

let updated = 0;
let alreadySet = 0;
let noFile = 0;

for (const p of all) {
  const filePath = resolve("public", "politicians", `${p.id}.jpg`);
  const fileExists = existsSync(filePath);
  const desiredPath = fileExists ? `/politicians/${p.id}.jpg` : null;

  if (!fileExists) {
    noFile++;
    continue;
  }

  if (p.image === desiredPath) {
    alreadySet++;
    continue;
  }

  await prisma.politician.update({
    where: { id: p.id },
    data: { image: desiredPath },
  });
  console.log(`  ✓ ${p.name} (${p.id}) → ${desiredPath}`);
  updated++;
}

console.log(`\nDone.`);
console.log(`  Updated:        ${updated}`);
console.log(`  Already set:    ${alreadySet}`);
console.log(`  No file on disk: ${noFile}`);

await prisma.$disconnect();
