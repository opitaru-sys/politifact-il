#!/usr/bin/env tsx
/** Diagnose coverage for specific politicians. */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();

const CHECK = [
  { id: "bennett", searchNames: ["בנט", "נפתלי בנט"] },
  { id: "may-golan", searchNames: ["מאי גולן"] }, // existing — for sanity
];

console.log("=== POLITICIANS IN DB ===");
for (const { id, searchNames } of CHECK) {
  const pol = await p.politician.findUnique({ where: { id } });
  console.log(`\n[${id}] ${pol ? `${pol.name} (${pol.party})` : "NOT IN DB"}`);
  if (pol) {
    const total = await p.claim.count({ where: { politicianId: id } });
    const approved = await p.claim.count({ where: { politicianId: id, status: "published", editorApproved: true } });
    const rejected = await p.claim.count({ where: { politicianId: id, editorApproved: false } });
    const last = await p.claim.findFirst({ where: { politicianId: id }, orderBy: { date: "desc" }, select: { date: true, quote: true, editorApproved: true, verifierNotes: true, correctionNote: true } });
    console.log(`  total claims: ${total} (${approved} approved, ${rejected} rejected)`);
    if (last) {
      console.log(`  last claim:   ${last.date.toISOString().slice(0, 10)} · approved=${last.editorApproved}`);
      console.log(`    quote:    ${last.quote.slice(0, 100)}`);
      if (last.verifierNotes) console.log(`    verifier: ${last.verifierNotes}`);
      if (last.correctionNote) console.log(`    correction: ${last.correctionNote}`);
    }
  }
  // Also search by name (in case there are duplicate politicians with diff id)
  for (const name of searchNames) {
    const byName = await p.politician.findMany({ where: { name: { contains: name } } });
    for (const x of byName) {
      if (x.id !== id) console.log(`  also by name "${name}": ${x.id} (${x.name})`);
    }
  }
}

// Look up Yair Golan specifically — by name, since the id might be anything
console.log("\n=== YAIR GOLAN (by name) ===");
const golanCandidates = await p.politician.findMany({
  where: { OR: [{ name: { contains: "יאיר גולן" } }, { name: { contains: "גולן" } }] },
});
if (golanCandidates.length === 0) {
  console.log("  NO POLITICIAN IN DB matching 'יאיר גולן' or 'גולן'");
} else {
  for (const x of golanCandidates) {
    const total = await p.claim.count({ where: { politicianId: x.id } });
    console.log(`  ${x.id} · ${x.name} (${x.party}) · ${total} claims`);
  }
}

// Look at articles that MENTION יאיר גולן (in title or content) to confirm
// we're seeing news about him but not extracting his claims
console.log("\n=== ARTICLES MENTIONING יאיר גולן ===");
const articles = await p.article.findMany({
  where: { OR: [{ title: { contains: "יאיר גולן" } }, { content: { contains: "יאיר גולן" } }] },
  orderBy: { fetchedAt: "desc" },
  take: 10,
  select: { title: true, source: true, fetchedAt: true, processed: true, extractedData: true },
});
console.log(`  found: ${articles.length}`);
for (const a of articles.slice(0, 5)) {
  console.log(`  · [${a.source}] ${a.title.slice(0, 80)} (${a.fetchedAt.toISOString().slice(0, 10)}, processed=${a.processed})`);
  if (a.processed && a.extractedData) {
    try {
      const ex = JSON.parse(a.extractedData) as { politicianName: string }[];
      if (ex.length > 0) console.log(`     extracted: ${ex.map((e) => e.politicianName).join(", ")}`);
      else console.log(`     extracted: 0 claims`);
    } catch {
      // ignore parse errors
    }
  }
}

await p.$disconnect();
