import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();

// Last 30 days, day-by-day claim density.
const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - 30);

const claims = await p.claim.findMany({
  where: {
    status: "published",
    editorApproved: true,
    date: { gte: cutoff },
  },
  select: { date: true },
});

const byDay: Record<string, number> = {};
for (const c of claims) {
  const day = c.date.toISOString().slice(0, 10);
  byDay[day] = (byDay[day] ?? 0) + 1;
}

const today = new Date();
let emptyDays = 0;
let totalClaims = 0;
console.log("Day-by-day claim coverage (last 30 days):");
for (let i = 29; i >= 0; i--) {
  const d = new Date(today);
  d.setDate(d.getDate() - i);
  const day = d.toISOString().slice(0, 10);
  const cnt = byDay[day] ?? 0;
  if (cnt === 0) emptyDays++;
  totalClaims += cnt;
  const bar = "█".repeat(cnt);
  console.log(`  ${day}: ${String(cnt).padStart(2)} ${bar}`);
}
console.log(`\nTotal: ${totalClaims} approved claims, avg ${(totalClaims/30).toFixed(1)}/day, ${emptyDays} empty days`);

// Same breakdown by article fetchedAt to see if it's an article supply problem
// or an extraction problem.
const articles = await p.article.count({
  where: { fetchedAt: { gte: cutoff } },
});
console.log(`Articles fetched in window: ${articles}`);

await p.$disconnect();
