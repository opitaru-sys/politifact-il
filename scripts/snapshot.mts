#!/usr/bin/env tsx
/**
 * Write today's row into DailySnapshot. Idempotent — uses upsert on day
 * (YYYY-MM-DD), so re-running the same day updates the existing row.
 *
 * Run at the end of scripts/daily.mts (or any cron) to keep the admin
 * dashboard's history chart populated.
 */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

export async function writeSnapshot() {
  const day = new Date().toISOString().slice(0, 10);
  const [totalClaims, publishedClaims, editorApproved, totalArticles, queueDepth, lastClaim] =
    await Promise.all([
      prisma.claim.count(),
      prisma.claim.count({ where: { status: "published" } }),
      prisma.claim.count({ where: { editorApproved: true } }),
      prisma.article.count(),
      prisma.article.count({ where: { processed: false } }),
      prisma.claim.findFirst({
        where: { status: "published" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);

  const row = await prisma.dailySnapshot.upsert({
    where: { day },
    create: {
      day,
      totalClaims,
      publishedClaims,
      editorApproved,
      totalArticles,
      queueDepth,
      lastClaimAt: lastClaim?.createdAt ?? null,
    },
    update: {
      totalClaims,
      publishedClaims,
      editorApproved,
      totalArticles,
      queueDepth,
      lastClaimAt: lastClaim?.createdAt ?? null,
    },
  });
  return row;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1].endsWith("snapshot.mts")) {
  const row = await writeSnapshot();
  console.log(`Snapshot for ${row.day}: ${row.editorApproved}/${row.publishedClaims} approved, queue=${row.queueDepth}`);
  await prisma.$disconnect();
}
