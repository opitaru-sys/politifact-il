#!/usr/bin/env tsx
/**
 * Sweep published "half-true" claims that are really "couldn't verify the
 * event" (the missed "Operation Roaring Lion" failure mode).
 *
 *   (default)        COUNT MODE — read-only. Reports suspects + breakdown.
 *   --apply          Re-check each suspect with grounding. Confidently
 *                    verified -> republish with the corrected verdict.
 *                    Still unverified -> status="review" (withheld for human).
 *                    Opinion non-claims -> hidden.
 *   --limit N        Only process N candidates (for a small validation run).
 *
 * Env: DATABASE_URL, GEMINI_API_KEY (for --apply).
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
forceLoadEnv("GEMINI_API_KEY");

const { PrismaClient } = await import("@prisma/client");
const { factCheckClaim, isConfidentlyVerified } = await import("../src/lib/fact-check");
const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const limitIdx = process.argv.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) : undefined;
const CONCURRENCY = 6;
const MAX_CONF = 0.5; // approved sweep threshold

const PUBLIC = { status: "published", editorApproved: true } as const;
const OPINION_MARKERS = ["אינו מכיל טענה עובדתית", "אין בו תוכן עובדתי"];
const opinionOr = [
  ...OPINION_MARKERS.map((p) => ({ summary: { contains: p } })),
  ...OPINION_MARKERS.map((p) => ({ explanation: { contains: p } })),
];
const recheckWhere = {
  ...PUBLIC,
  verdict: "half-true",
  confidence: { lte: MAX_CONF },
  NOT: { OR: opinionOr },
};

if (!APPLY) {
  const [total, halfTrue, candidates, opinion] = await Promise.all([
    prisma.claim.count({ where: PUBLIC }),
    prisma.claim.count({ where: { ...PUBLIC, verdict: "half-true" } }),
    prisma.claim.count({ where: recheckWhere }),
    prisma.claim.count({ where: { ...PUBLIC, verdict: "half-true", OR: opinionOr } }),
  ]);
  console.log(`Published: ${total} (half-true ${halfTrue})`);
  console.log(`Re-check candidates (conf<=${MAX_CONF}, non-opinion): ${candidates} (~$${(candidates * 0.05).toFixed(2)})`);
  console.log(`Opinion non-claims to hide: ${opinion}`);
  console.log(`\nDry run. Re-run with --apply to fix them (--limit N to test on a few first).`);
  await prisma.$disconnect();
  process.exit(0);
}

// --- APPLY ---
// 1) Hide opinion non-claims (free, no re-check).
const opinionClaims = await prisma.claim.findMany({
  where: { ...PUBLIC, verdict: "half-true", OR: opinionOr },
  select: { id: true },
});
if (opinionClaims.length && LIMIT === undefined) {
  await prisma.claim.updateMany({
    where: { id: { in: opinionClaims.map((c) => c.id) } },
    data: { status: "review", editorApproved: false, verifierNotes: "הוסתר: אינו טענה עובדתית (דעה/רטוריקה)" },
  });
  console.log(`Hid ${opinionClaims.length} opinion non-claims.`);
}

// 2) Re-check candidates with grounding.
const candidates = await prisma.claim.findMany({
  where: recheckWhere,
  select: { id: true, quote: true, topic: true, date: true, confidence: true, politician: { select: { name: true } } },
  orderBy: { createdAt: "desc" },
  ...(LIMIT !== undefined ? { take: LIMIT } : {}),
});
console.log(`Re-checking ${candidates.length} candidates (concurrency ${CONCURRENCY})...`);

let fixed = 0;
let withheld = 0;
let failed = 0;

for (let i = 0; i < candidates.length; i += CONCURRENCY) {
  const chunk = candidates.slice(i, i + CONCURRENCY);
  await Promise.all(
    chunk.map(async (c) => {
      try {
        const r = await factCheckClaim(
          { politicianName: c.politician.name, quote: c.quote, topic: c.topic },
          { claimDate: c.date },
        );
        if (isConfidentlyVerified(r)) {
          await prisma.claim.update({
            where: { id: c.id },
            data: {
              verdict: r.verdict,
              summary: r.summary,
              explanation: r.explanation,
              factSource: r.factSource,
              factSourceUrl: r.factSourceUrl,
              confidence: r.confidence,
              status: "published",
              editorApproved: true,
              verifiedAt: new Date(),
              verifierNotes: "אומת מחדש בבדיקה חוזרת",
            },
          });
          fixed++;
          console.log(`  ✓ fixed ${c.politician.name}: ${c.confidence} -> ${r.verdict} (${r.confidence})`);
        } else {
          await prisma.claim.update({
            where: { id: c.id },
            data: {
              status: "review",
              editorApproved: false,
              verifiedAt: new Date(),
              verifierNotes: "לא אומת בבדיקה חוזרת — דורש בדיקה אנושית",
            },
          });
          withheld++;
          console.log(`  ~ withheld ${c.politician.name} (still unverified)`);
        }
      } catch (err) {
        failed++;
        console.error(`  ✗ failed ${c.id}: ${err instanceof Error ? err.message : err}`);
      }
    }),
  );
  console.log(`progress @ ${Math.min(i + CONCURRENCY, candidates.length)}/${candidates.length}: fixed=${fixed} withheld=${withheld} failed=${failed}`);
}

console.log(`\nDone. fixed(published)=${fixed} withheld(review)=${withheld} failed=${failed}`);
await prisma.$disconnect();
process.exit(0);
