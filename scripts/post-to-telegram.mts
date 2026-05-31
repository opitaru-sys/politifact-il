#!/usr/bin/env tsx
/**
 * Auto-post newly-published fact-checks to the Telegram channel @bdukcoil.
 * Each post = the claim's OG verdict card (image) + a caption (politician,
 * verdict, short quote) + a link back to the site. New followers get every
 * fact-check pushed to them, and each post links back (drives traffic).
 *
 * Backlog handling WITHOUT a bulk DB write: we only post claims created
 * at/after POST_SINCE (the activation cutoff), so turning this on never
 * blasts the pre-existing archive to the channel. Dedup within that window
 * uses Claim.telegramPostedAt — post where it IS NULL, then stamp it. A hard
 * guard also aborts if an unexpectedly large number are pending.
 *
 * Wired into .github/workflows/telegram.yml (every 2h at :45).
 * Env: TELEGRAM_BOT_TOKEN + DATABASE_URL (GitHub secrets); optional
 * TELEGRAM_SINCE (ISO cutoff), TELEGRAM_CHANNEL (default @bdukcoil),
 * NEXT_PUBLIC_SITE_URL / SITE_URL.
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
const CHANNEL = process.env.TELEGRAM_CHANNEL || "@bdukcoil";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://bduk.co.il";
// Activation cutoff: only claims published from this moment on are posted,
// so the pre-existing archive is never sent. Override with TELEGRAM_SINCE.
const POST_SINCE = new Date(process.env.TELEGRAM_SINCE || "2026-05-29T10:00:00Z");
const APPLY = process.argv.includes("--apply");
const BATCH = 15;
const PENDING_GUARD = 50;

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

// Normalize a quote for de-dup comparison (strip punctuation, collapse spaces).
function normQuote(s: string): string {
  return s.replace(/["'״׳.,:;!?\-–—()\[\]]/g, "").replace(/\s+/g, " ").trim();
}

if (!TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN not set — nothing to do.");
  await prisma.$disconnect();
  process.exit(0);
}

// Only post "lies": שקר (false) + חצי אמת (half-true). "true" verdicts (bio
// facts, confirmations, fragments of a speech) were flooding the channel with
// low-signal posts. The channel is about who misleads the public, not a fact
// ticker — so true claims are no longer pushed.
const FILTER = {
  status: "published",
  editorApproved: true,
  telegramPostedAt: null,
  verdict: { in: ["false", "half-true"] },
  createdAt: { gte: POST_SINCE },
};

// Safety: if a surprising number are pending since the cutoff, something is
// off (workflow was down for a long time, or the cutoff is too old). Abort
// rather than flood the channel; raise TELEGRAM_SINCE or the guard if it's
// genuinely expected.
const pending = await prisma.claim.count({ where: FILTER });
if (pending > PENDING_GUARD) {
  console.error(
    `${pending} claims pending since ${POST_SINCE.toISOString()} (> ${PENDING_GUARD}). ` +
      `Aborting to avoid a flood. Move TELEGRAM_SINCE forward, or raise the guard if expected.`,
  );
  await prisma.$disconnect();
  process.exit(1);
}

const claims = await prisma.claim.findMany({
  where: FILTER,
  include: { politician: { select: { name: true } } },
  orderBy: { createdAt: "asc" },
  take: BATCH,
});

// De-dup against everything already telegram-handled: never push the same line
// twice for a politician. The pipeline can mint the same quote from two source
// articles (different days, sometimes different verdicts), and the old per-claim
// dedup let each one post — which is exactly the duplicate spam on the channel.
const postedRaw = await prisma.claim.findMany({
  where: { telegramPostedAt: { not: null } },
  select: { politicianId: true, quote: true },
});
const postedByPol = new Map<string, string[]>();
for (const p of postedRaw) {
  const arr = postedByPol.get(p.politicianId) ?? [];
  arr.push(normQuote(p.quote));
  postedByPol.set(p.politicianId, arr);
}
const isAlreadyPosted = (politicianId: string, quote: string): boolean => {
  const nq = normQuote(quote);
  const prior = postedByPol.get(politicianId) ?? [];
  return prior.some(
    (pq) => pq === nq || (nq.length >= 15 && pq.includes(nq)) || (pq.length >= 15 && nq.includes(pq)),
  );
};

console.log(
  `${claims.length} claim(s) to post to ${CHANNEL} (since ${POST_SINCE.toISOString()})${APPLY ? "" : " — dry run, pass --apply to send"}`,
);

let posted = 0;
for (const c of claims) {
  if (isAlreadyPosted(c.politicianId, c.quote)) {
    console.log(`  ↷ skip dup ${c.id} (${c.politician.name}) — matching quote already posted`);
    // A dedup skip is a terminal telegram decision (we will never post a repeat),
    // so stamp it to keep it out of future batches rather than re-checking forever.
    if (APPLY) await prisma.claim.update({ where: { id: c.id }, data: { telegramPostedAt: new Date() } });
    continue;
  }
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
    // Track within this run too, so two pending dups don't both post.
    const seen = postedByPol.get(c.politicianId) ?? [];
    seen.push(normQuote(c.quote));
    postedByPol.set(c.politicianId, seen);
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
