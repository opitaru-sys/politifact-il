#!/usr/bin/env tsx
/** Find the two specific claims from user feedback. */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;
const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();

const needles = [
  "רשימה משותפת, טכנית ופלורליסטית",
  "ימנו זלקה",
  "זלקה לא היה",
];

for (const n of needles) {
  console.log(`\n=== "${n}" ===`);
  const matches = await p.claim.findMany({
    where: { quote: { contains: n } },
    select: { id: true, quote: true, verdict: true, summary: true, politicianId: true, source: true, editorApproved: true, status: true, verifierNotes: true, date: true },
  });
  console.log(`  found: ${matches.length}`);
  for (const c of matches) {
    console.log(`  [${c.editorApproved ? "✓ live" : "✗ hidden"}] ${c.verdict.padEnd(10)} ${c.politicianId} (${c.source}, ${c.date.toISOString().slice(0,10)})`);
    console.log(`    quote: ${c.quote}`);
    if (c.summary) console.log(`    summary: ${c.summary}`);
    if (c.verifierNotes) console.log(`    notes: ${c.verifierNotes}`);
  }
}

await p.$disconnect();
