#!/usr/bin/env tsx
/**
 * Fetch missing politician photos from Hebrew Wikipedia / Wikimedia
 * Commons. Wikipedia images are open-licensed (CC BY-SA in most cases,
 * sometimes public domain) and are the same source the Knesset uses
 * for many of its official-looking portraits.
 *
 * For each politician where Politician.image is null:
 *   1. Query he.wikipedia.org for `prop=pageimages` by the Hebrew name.
 *   2. If a thumbnail exists, download it to public/politicians/<id>.jpg.
 *   3. Update the DB row with the new path.
 *
 * Politicians with no Wikipedia article (or no infobox photo) are
 * logged and skipped — the avatar component renders fallback initials
 * for those.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

interface WikiResponse {
  query?: {
    pages?: Record<string, {
      pageid?: number;
      title?: string;
      thumbnail?: { source: string; width: number; height: number };
    }>;
  };
}

async function fetchThumbnailUrl(hebrewName: string): Promise<string | null> {
  const url = new URL("https://he.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("titles", hebrewName);
  url.searchParams.set("prop", "pageimages");
  url.searchParams.set("pithumbsize", "400");
  url.searchParams.set("piprop", "thumbnail");
  url.searchParams.set("format", "json");
  url.searchParams.set("redirects", "1"); // follow redirects to canonical title

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "Badak-FactCheck/1.0 (https://bduk.co.il)" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as WikiResponse;
  const pages = data.query?.pages ?? {};
  for (const page of Object.values(pages)) {
    if (page.thumbnail?.source) return page.thumbnail.source;
  }
  return null;
}

async function downloadImage(srcUrl: string, destPath: string): Promise<boolean> {
  const res = await fetch(srcUrl, {
    headers: { "User-Agent": "Badak-FactCheck/1.0 (https://bduk.co.il)" },
  });
  if (!res.ok) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buf);
  return true;
}

// Process every politician with no image — including ones with no
// approved claims yet. Cheap to over-fetch.
const all = await prisma.politician.findMany({
  where: { image: null },
  select: { id: true, name: true },
  orderBy: { name: "asc" },
});

console.log(`${all.length} politicians without images. Fetching from Wikipedia...\n`);

let fetched = 0;
let missing: string[] = [];

for (const p of all) {
  const destPath = resolve("public", "politicians", `${p.id}.jpg`);

  // Defensive — if file somehow appeared, just link it.
  if (existsSync(destPath)) {
    await prisma.politician.update({ where: { id: p.id }, data: { image: `/politicians/${p.id}.jpg` } });
    console.log(`  ↻ ${p.name} (${p.id}) — file already on disk, just linked`);
    fetched++;
    continue;
  }

  try {
    const thumbUrl = await fetchThumbnailUrl(p.name);
    if (!thumbUrl) {
      console.log(`  ✗ ${p.name} (${p.id}) — no Wikipedia thumbnail`);
      missing.push(`${p.id} (${p.name})`);
      continue;
    }

    const ok = await downloadImage(thumbUrl, destPath);
    if (!ok) {
      console.log(`  ✗ ${p.name} (${p.id}) — download failed`);
      missing.push(`${p.id} (${p.name})`);
      continue;
    }

    await prisma.politician.update({
      where: { id: p.id },
      data: { image: `/politicians/${p.id}.jpg` },
    });
    console.log(`  ✓ ${p.name} (${p.id})`);
    fetched++;
  } catch (err) {
    console.log(`  ✗ ${p.name} (${p.id}) — error: ${err instanceof Error ? err.message : err}`);
    missing.push(`${p.id} (${p.name})`);
  }

  // Be polite to Wikipedia / Wikimedia Commons. The commons CDN throttles
  // aggressively on bursts; 1s between requests avoids most 429s.
  await new Promise((r) => setTimeout(r, 1000));
}

console.log(`\n--- Summary ---`);
console.log(`Fetched: ${fetched}`);
console.log(`Missing: ${missing.length}`);
if (missing.length > 0) {
  console.log(`\nStill need photos (Wikipedia search returned nothing):`);
  for (const m of missing) console.log(`  - ${m}`);
}

await prisma.$disconnect();
