import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();
const [queue, claims, articles, approved, rejected, unverified, byVerdict] = await Promise.all([
  p.article.count({ where: { processed: false } }),
  p.claim.count(),
  p.article.count(),
  p.claim.count({ where: { status: "published", editorApproved: true } }),
  p.claim.count({ where: { status: "published", editorApproved: false } }),
  p.claim.count({ where: { status: "published", verifiedAt: null } }),
  p.claim.groupBy({
    by: ["verdict"],
    where: { status: "published", editorApproved: true },
    _count: true,
  }),
]);
console.log("Unprocessed queue:", queue);
console.log("Total claims:", claims);
console.log("Total articles:", articles);
console.log("");
console.log("Published & approved (publicly visible):", approved);
console.log("Published but rejected (hidden):", rejected);
console.log("Published but never verified:", unverified);
console.log("");
console.log("Approved breakdown by verdict:");
for (const row of byVerdict) {
  console.log(`  ${row.verdict}: ${row._count}`);
}
await p.$disconnect();
