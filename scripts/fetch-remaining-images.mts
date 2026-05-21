#!/usr/bin/env tsx
/**
 * Targeted Wikipedia lookups for politicians whose default Hebrew name
 * is a common name with multiple Wikipedia disambiguations. The bulk
 * fetcher in fetch-politician-images.mts uses the politician's
 * stored name and resolves redirects, but for "אלי כהן" the redirect
 * lands on a disambiguation page, not the politician's article.
 *
 * Run this AFTER fetch-politician-images.mts has done the easy ones.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

// politicianId → Wikipedia article title (Hebrew)
const OVERRIDES: Record<string, string> = {
  "eli-cohen": "אלי כהן (פוליטיקאי, 1972)",
  "dudi-amsalem": "דוד אמסלם (חבר הכנסת)",
};

async function fetchAndSave(id: string, wikiTitle: string): Promise<boolean> {
  const url = new URL("https://he.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("titles", wikiTitle);
  url.searchParams.set("prop", "pageimages");
  url.searchParams.set("pithumbsize", "400");
  url.searchParams.set("piprop", "thumbnail");
  url.searchParams.set("format", "json");
  url.searchParams.set("redirects", "1");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "Badak-FactCheck/1.0 (https://bduk.co.il)" },
  });
  if (!res.ok) return false;
  const data = (await res.json()) as {
    query?: { pages?: Record<string, { thumbnail?: { source: string } }> };
  };
  const pages = data.query?.pages ?? {};
  let thumbUrl: string | undefined;
  for (const page of Object.values(pages)) {
    if (page.thumbnail?.source) { thumbUrl = page.thumbnail.source; break; }
  }
  if (!thumbUrl) return false;

  const imgRes = await fetch(thumbUrl, {
    headers: { "User-Agent": "Badak-FactCheck/1.0 (https://bduk.co.il)" },
  });
  if (!imgRes.ok) return false;
  const buf = Buffer.from(await imgRes.arrayBuffer());

  const destPath = resolve("public", "politicians", `${id}.jpg`);
  writeFileSync(destPath, buf);
  await prisma.politician.update({
    where: { id },
    data: { image: `/politicians/${id}.jpg` },
  });
  return true;
}

for (const [id, title] of Object.entries(OVERRIDES)) {
  const ok = await fetchAndSave(id, title);
  console.log(`${ok ? "✓" : "✗"} ${id} → ${title}`);
  await new Promise((r) => setTimeout(r, 1000));
}

await prisma.$disconnect();
