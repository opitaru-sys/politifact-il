#!/usr/bin/env tsx
/**
 * 2026-05-26 follow-up to coverage fix. Web-research confirmed:
 *
 * 1. The Democrats party (הדמוקרטים) has 4 MKs: Golan + Kariv +
 *    Lazimi + Rayten. The latter three are currently labeled
 *    "העבודה" in the DB — needs updating to "הדמוקרטים".
 *
 * 2. Merav Michaeli REFUSED to join the merger and stays in the rump
 *    Labor faction. DB label "העבודה" for her is correct, no change.
 *
 * 3. Three new MKs surfaced in the audit (≥10 extractions, no DB row)
 *    need adding with the correct party:
 *    - Mati Tzarfati Harkabi → יש עתיד
 *    - Michal Shir Segman → יש עתיד
 *    - Samer Ben Saeed → חד"ש-תע"ל (sworn in June 2025 via rotation)
 *
 * Idempotent: re-running just updates / upserts.
 */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();

// Party reassignments from Labor → Democrats
const PARTY_MOVES = [
  { id: "gilad-kariv", newParty: "הדמוקרטים" },
  { id: "naama-lazimi", newParty: "הדמוקרטים" },
  { id: "efrat-rayten", newParty: "הדמוקרטים" },
];

console.log("=== Reassigning Labor → Democrats ===");
for (const move of PARTY_MOVES) {
  const existing = await p.politician.findUnique({ where: { id: move.id } });
  if (!existing) {
    console.log(`  ! ${move.id} not in DB, skipping`);
    continue;
  }
  if (existing.party === move.newParty) {
    console.log(`  ✓ ${existing.name} already ${move.newParty}`);
    continue;
  }
  await p.politician.update({
    where: { id: move.id },
    data: { party: move.newParty },
  });
  console.log(`  → ${existing.name}: ${existing.party} → ${move.newParty}`);
}

// New MKs to add
const NEW_MKS = [
  { id: "mati-tzarfati-harkabi", name: "מטי צרפתי הרכבי", party: "יש עתיד" },
  { id: "michal-shir-segman", name: "מיכל שיר סגמן", party: "יש עתיד" },
  { id: "samer-ben-saeed", name: "סמיר בן סעיד", party: "חד\"ש-תע\"ל" },
];

console.log("\n=== Adding new MKs ===");
for (const mk of NEW_MKS) {
  const existing = await p.politician.findUnique({ where: { id: mk.id } });
  if (existing) {
    console.log(`  ✓ ${mk.id} already exists (${existing.name}, ${existing.party})`);
    if (existing.name !== mk.name || existing.party !== mk.party) {
      await p.politician.update({
        where: { id: mk.id },
        data: { name: mk.name, party: mk.party },
      });
      console.log(`    updated → ${mk.name} (${mk.party})`);
    }
    continue;
  }
  await p.politician.create({
    data: { id: mk.id, name: mk.name, party: mk.party, role: null, image: null },
  });
  console.log(`  + added: ${mk.id} (${mk.name}, ${mk.party})`);
}

await p.$disconnect();
