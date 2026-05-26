#!/usr/bin/env tsx
/** Sample may-golan claims for any that might actually be about Yair Golan. */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;
const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();

// May Golan claims whose quote OR source mentions יאיר, or whose source
// references the Democrats / opposition / generals — heuristic signals.
const mayClaims = await p.claim.findMany({
  where: { politicianId: "may-golan" },
  select: { id: true, quote: true, source: true, sourceUrl: true, date: true, editorApproved: true },
});

console.log(`Total May Golan claims: ${mayClaims.length}`);

const suspectQuote = mayClaims.filter((c) =>
  c.quote.includes("יאיר") ||
  c.quote.includes("הדמוקרטים") ||
  c.quote.includes("המחנה הדמוקרטי") ||
  c.quote.includes("האלוף") ||
  c.quote.includes("רב אלוף") ||
  c.quote.includes("מרצ"),
);
console.log(`\nClaims mentioning יאיר / דמוקרטים / האלוף / מרצ in QUOTE: ${suspectQuote.length}`);
for (const c of suspectQuote.slice(0, 10)) {
  console.log(`  [${c.editorApproved ? "✓" : "✗"}] ${c.date.toISOString().slice(0, 10)} · ${c.quote.slice(0, 120)}`);
  console.log(`    src: ${c.source}`);
}

// Also check article context: any article where May Golan got a claim but
// the article title mentions יאיר גולן (likely the article is about Yair).
console.log(`\n=== Articles that mention יאיר גולן but had a May Golan claim extracted ===`);
const articles = await p.article.findMany({
  where: {
    OR: [{ title: { contains: "יאיר גולן" } }, { content: { contains: "יאיר גולן" } }],
  },
  select: { url: true, title: true, source: true, extractedData: true },
});
let suspectArticles = 0;
for (const a of articles) {
  if (!a.extractedData) continue;
  try {
    const ex = JSON.parse(a.extractedData) as { politicianName: string; quote: string }[];
    const mayClaimsFromArticle = ex.filter((e) => e.politicianName.includes("גולן"));
    if (mayClaimsFromArticle.length > 0) {
      suspectArticles++;
      console.log(`\n  [${a.source}] ${a.title.slice(0, 90)}`);
      for (const e of mayClaimsFromArticle) {
        console.log(`    extracted as "${e.politicianName}": ${e.quote.slice(0, 120)}`);
      }
    }
  } catch {
    // ignore
  }
}
console.log(`\nArticles with potential May/Yair Golan confusion: ${suspectArticles}/${articles.length}`);

await p.$disconnect();
