#!/usr/bin/env tsx
/**
 * Post the latest PUBLISHED weekly digest to the @bdukcoil Telegram channel:
 * the digest OG cover card + a caption (title, intro, lead insight headings,
 * link). Manual-trigger only (no cron) — fire it after publishing a digest
 * at /admin/digest. Only posts status="published" digests (never drafts).
 *
 * Env: TELEGRAM_BOT_TOKEN + DATABASE_URL (GitHub secrets); optional
 * TELEGRAM_CHANNEL (default @bdukcoil), NEXT_PUBLIC_SITE_URL / SITE_URL.
 * Dry run by default (prints what it would post); pass --apply to send.
 */
import { readFileSync } from "fs";

function forceLoadEnv(key: string): void {
  if (process.env[key] && process.env[key]!.length > 5) return;
  try {
    const content = readFileSync(".env.local", "utf8");
    const m = content.match(new RegExp(`^${key}=(.*)$`, "m"));
    if (m) {
      let val = m[1].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (val.length > 5) process.env[key] = val;
    }
  } catch {
    /* missing */
  }
}
forceLoadEnv("DATABASE_URL");
forceLoadEnv("TELEGRAM_BOT_TOKEN");

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHANNEL = process.env.TELEGRAM_CHANNEL || "@bdukcoil";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://bduk.co.il";
const APPLY = process.argv.includes("--apply");

const digestSlug = (d: Date) => d.toISOString().slice(0, 10);

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

if (!TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN not set — nothing to do.");
  await prisma.$disconnect();
  process.exit(0);
}

const digest = await prisma.digest.findFirst({
  where: { status: "published" },
  orderBy: { weekOf: "desc" },
});

if (!digest) {
  console.log("No published digest found (drafts are not posted). Publish one at /admin/digest first.");
  await prisma.$disconnect();
  process.exit(0);
}

const url = `${SITE_URL}/digest/${digestSlug(digest.weekOf)}`;
const photo = `${url}/opengraph-image`;

// Lead insight headings as a teaser (top 3).
const sections = (digest.sections ?? []) as Array<{ type?: string; heading?: string }>;
const headings = sections
  .filter((s) => s?.type === "insight" && s?.heading)
  .map((s) => s.heading as string)
  .slice(0, 3);

const intro = digest.intro && digest.intro.length > 220 ? digest.intro.slice(0, 217) + "…" : digest.intro || "";
const bullets = headings.map((h) => `• ${escapeHtml(h)}`).join("\n");
const caption =
  `<b>${escapeHtml(digest.title)}</b>\n` +
  (intro ? `${escapeHtml(intro)}\n` : "") +
  (bullets ? `\n${bullets}\n` : "") +
  `\n${url}`;

console.log(`Latest published digest: "${digest.title}" (${digestSlug(digest.weekOf)})`);

if (!APPLY) {
  console.log(`[dry run — pass --apply to send] caption:\n${caption}`);
  await prisma.$disconnect();
  process.exit(0);
}

try {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHANNEL, photo, caption, parse_mode: "HTML" }),
  });
  const data = (await res.json()) as { ok: boolean; description?: string };
  if (!data.ok) throw new Error(data.description || `HTTP ${res.status}`);
  console.log(`✓ posted digest to ${CHANNEL}`);
} catch (err) {
  console.error(`✗ failed to post digest: ${err instanceof Error ? err.message : String(err)}`);
  await prisma.$disconnect();
  process.exit(1);
}

await prisma.$disconnect();
