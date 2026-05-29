#!/usr/bin/env tsx
/**
 * ONE-TIME: mark all currently published + editor-approved claims as already
 * posted to Telegram (telegramPostedAt = now), so turning on auto-posting
 * (scripts/post-to-telegram.mts) doesn't blast the entire backlog to the
 * @bduk_il channel. Run once, right after adding the Claim.telegramPostedAt
 * column (`npm run db:push`). Idempotent — only touches rows where
 * telegramPostedAt IS NULL.
 *
 * Dry run by default; pass --apply to write.
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

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const where = { status: "published", editorApproved: true, telegramPostedAt: null } as const;
const count = await prisma.claim.count({ where });
console.log(`${count} published+approved claim(s) not yet marked as posted.`);

if (APPLY) {
  const res = await prisma.claim.updateMany({ where, data: { telegramPostedAt: new Date() } });
  console.log(
    `Marked ${res.count} as already-posted. The backlog will NOT be sent — only NEW claims post from here on.`,
  );
} else {
  console.log("Dry run — re-run with --apply to mark them.");
}

await prisma.$disconnect();
