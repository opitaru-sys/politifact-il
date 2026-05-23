#!/usr/bin/env tsx
/**
 * Diagnostic for the "פעילות יומית" admin card. Mirrors the exact
 * four counts the admin page renders so you can sanity-check what
 * the page will show without opening a browser.
 *
 * Cutoff is midnight Asia/Jerusalem — same logic as the admin page
 * (which is the consumer that matters). DST-correct: uses
 * Intl.DateTimeFormat with timeZone instead of a hardcoded offset.
 */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

function todayMidnightIsrael(): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  const offset =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      timeZoneName: "longOffset",
    })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")
      ?.value?.replace("GMT", "") || "+03:00";
  return new Date(`${y}-${m}-${d}T00:00:00${offset}`);
}

const todayStart = todayMidnightIsrael();
console.log(`Cutoff (Israel midnight): ${todayStart.toISOString()}`);
console.log();

const [created, approved, published, articles] = await Promise.all([
  prisma.claim.count({ where: { createdAt: { gte: todayStart } } }),
  prisma.claim.count({ where: { editorApproved: true, verifiedAt: { gte: todayStart } } }),
  prisma.claim.count({ where: { status: "published", createdAt: { gte: todayStart } } }),
  prisma.article.count({ where: { fetchedAt: { gte: todayStart } } }),
]);

console.log(`טענות חדשות      (created):  ${created}`);
console.log(`אושרו היום       (approved): ${approved}`);
console.log(`כתבות חדשות      (articles): ${articles}`);
console.log(`פורסמו היום      (published from today): ${published}`);
console.log(
  `אחוז אישור היום : ${published > 0 ? Math.round((approved / published) * 100) : 0}%`,
);

await prisma.$disconnect();
