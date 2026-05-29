#!/usr/bin/env tsx
/**
 * Auto-post newly-published fact-checks to the Telegram channel @bduk_il.
 * Each post = the claim's OG verdict card (image) + a caption (politician,
 * verdict, short quote) + a link back to the site. New followers get every
 * fact-check pushed to them, and each post links back (drives traffic).
 *
 * Dedup: Claim.telegramPostedAt. We post published + editor-approved claims
 * where telegramPostedAt IS NULL, oldest first, then stamp it. Pre-existing
 * claims were backfilled to "now" (scripts/telegram-backfill.mts) so this
 * never blasts the backlog — and there's a hard guard below in case the
 * backfill was skipped.
 *
 * Wired into .github/workflows/telegram.yml (every 2h at :45).
 * Env: TELEGRAM_BOT_TOKEN + DATABASE_URL (GitHub secrets); optional
 * TELEGRAM_CHANNEL (default @bduk_il) and NEXT_PUBLIC_SITE_URL / SITE_URL.
 *
 * Dry run by default (lists what it would post); pass --apply to send.
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
const CHANNEL = process.env.TELEGRAM_CHANNEL || "@bduk_il";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://bduk.co.il";
const APPLY = process.argv.includes("--apply");
const BATCH = 15;
const BACKLOG_GUARD = 50;

const VERDICT_LABEL: Record<string, string> = {
  true: "אמת",
  "half-true": "חצי אמת",
  false: "שקר",
};

// Telegram HTML parse_mode only decodes &amp; &lt; &gt; — escape exactly those
// (NOT quotes; &quot; would render literally).
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

if (!TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN not set — nothing to do.");
  await prisma.$disconnect();
  process.exit(0);
}

const PUBLIC_FILTER = { status: "published", editorApproved: true, telegramPostedAt: null } as const;

// Safety: if a huge number of claims are unposted, the one-time backfill was
// almost certainly skipped. Refuse to run rather than slowly blast the whole
// archive to subscribers.
const unpostedTotal = await prisma.claim.count({ where: PUBLIC_FILTER });
if (unpostedTotal > BACKLOG_GUARD) {
  console.error(
    `${unpostedTotal} unposted published claims (> ${BACKLOG_GUARD}). The one-time backfill ` +
      `probably wasn't run. Aborting to avoid blasting the backlog.\n` +
      `Run once first:  npx tsx scripts/telegram-backfill.mts --apply`,
  );
  await prisma.$disconnect();
  process.exit(1);
}

const claims = await prisma.claim.findMany({
  where: PUBLIC_FILTER,
  include: { politician: { select: { name: true } } },
  orderBy: { createdAt: "asc" },
  take: BATCH,
});

console.log(`${claims.length} claim(s) to post to ${CHANNEL}${APPLY ? "" : " (dry run — pass --apply to send)"}`);

let posted = 0;
for (const c of claims) {
  const verdict = VERDICT_LABEL[c.verdict] ?? c.verdict;
  const quote = c.quote.length > 280 ? c.quote.slice(0, 277) + "…" : c.quote;
  const url = `${SITE_URL}/claim/${c.id}`;
  const photo = `${url}/opengraph-image`;
  const caption =
    `<b>${escapeHtml(c.politician.name)}</b>\n` +
    `"${escapeHtml(quote)}"\n\n` +
    `<b>פסק דין: ${escapeHtml(verdict)}</b>\n` +
    url;

  if (!APPLY) {
    console.log(`  [dry] ${c.id} — ${c.politician.name}: ${verdict}`);
    continue;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHANNEL, photo, caption, parse_mode: "HTML" }),
    });
    const data = (await res.json()) as { ok: boolean; description?: string };
    if (!data.ok) throw new Error(data.description || `HTTP ${res.status}`);
    await prisma.claim.update({ where: { id: c.id }, data: { telegramPostedAt: new Date() } });
    posted++;
    console.log(`  ✓ posted ${c.id} (${c.politician.name})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ failed ${c.id}: ${msg}`);
    // Leave telegramPostedAt null to retry next run. Stop the batch so a
    // persistent error (bad token / bot not admin) doesn't spam failures.
    break;
  }
  // Be gentle with the channel-post rate limit.
  await new Promise((r) => setTimeout(r, 1500));
}

console.log(`Done. posted=${posted}`);
await prisma.$disconnect();
