import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");

const p = new PrismaClient();
const articles = await p.article.count();
const politicians = await p.politician.count();
const unprocessed = await p.article.count({ where: { processed: false } });
const claims = await p.claim.count();

console.log("Prisma runtime DB:");
console.log("  Articles:", articles);
console.log("  Unprocessed:", unprocessed);
console.log("  Politicians:", politicians);
console.log("  Claims:", claims);
console.log("  DATABASE_URL:", process.env.DATABASE_URL);

await p.$disconnect();
