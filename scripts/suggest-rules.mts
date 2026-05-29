#!/usr/bin/env tsx
/**
 * Rule suggester (read-only). Learns from the editor's review-queue decisions:
 * finds words / 2-word phrases that are common in DISMISSED claims but rare in
 * PUBLISHED ones, with a false-positive preview (how many live claims each would
 * wrongly catch). Output is a ranked list of candidate deterministic filters to
 * consider adding to src/lib/claim-quality.ts — nothing is written.
 *
 * It gets sharper as decisions accumulate (humanDecision is stamped by the
 * Dismiss/Publish buttons in /admin/review). With little data it says so.
 *
 *   npx tsx scripts/suggest-rules.mts            # top suggestions
 *   npx tsx scripts/suggest-rules.mts --min 3    # min support (default 4)
 *
 * Env: DATABASE_URL.
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

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const minIdx = process.argv.indexOf("--min");
const MIN_SUPPORT = minIdx >= 0 ? Number(process.argv[minIdx + 1]) : 4;

// Light Hebrew stopwords + prefixless particles. Tokens this short or generic
// carry no signal. Not exhaustive — just enough to cut noise.
const STOP = new Set([
  "של", "את", "על", "עם", "לא", "כי", "זה", "זו", "הוא", "היא", "אני", "אנחנו",
  "הם", "הן", "גם", "או", "אבל", "יש", "אין", "מה", "מי", "אל", "כל", "רק",
  "עוד", "כבר", "אם", "כך", "כדי", "בין", "אחרי", "לפני", "היה", "היו", "הזה",
  "אשר", "אותו", "אותה", "להם", "ולא", "וכן", "כמו", "עד", "פי", "תוך", "לפי",
  "אצל", "מאוד", "יותר", "פחות", "נגד", "בעד", "שלא", "שזה", "ההוא",
]);

function tokens(s: string): string[] {
  return (s || "")
    .replace(/[֑-ׇ]/g, "") // strip niqqud/cantillation
    .replace(/["'`.,:;!?()\[\]{}<>–—“”…/\\|*–—-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t));
}

function countGrams(quotes: string[]): { uni: Map<string, number>; bi: Map<string, number> } {
  const uni = new Map<string, number>();
  const bi = new Map<string, number>();
  for (const q of quotes) {
    const ts = tokens(q);
    const seenU = new Set<string>();
    const seenB = new Set<string>();
    for (let i = 0; i < ts.length; i++) {
      if (!seenU.has(ts[i])) { uni.set(ts[i], (uni.get(ts[i]) ?? 0) + 1); seenU.add(ts[i]); }
      if (i + 1 < ts.length) {
        const g = `${ts[i]} ${ts[i + 1]}`;
        if (!seenB.has(g)) { bi.set(g, (bi.get(g) ?? 0) + 1); seenB.add(g); }
      }
    }
  }
  return { uni, bi };
}

const [dismissed, published] = await Promise.all([
  prisma.claim.findMany({ where: { humanDecision: "dismiss" }, select: { quote: true } }),
  prisma.claim.findMany({ where: { status: "published", editorApproved: true }, select: { quote: true } }),
]);

console.log(`Editor dismissals (labels): ${dismissed.length}`);
console.log(`Published baseline: ${published.length}`);
if (dismissed.length < MIN_SUPPORT) {
  console.log(
    `\nNot enough decisions yet (need >= ${MIN_SUPPORT} dismissals). Keep using Dismiss/Publish in /admin/review; re-run later.`,
  );
  await prisma.$disconnect();
  process.exit(0);
}

const dGrams = countGrams(dismissed.map((c) => c.quote));
const pGrams = countGrams(published.map((c) => c.quote));
const D = dismissed.length;
const P = Math.max(1, published.length);

interface Cand { gram: string; kind: "word" | "phrase"; support: number; fp: number; lift: number; }
const cands: Cand[] = [];
function consider(map: Map<string, number>, base: Map<string, number>, kind: "word" | "phrase") {
  for (const [gram, support] of map) {
    if (support < MIN_SUPPORT) continue;
    const fp = base.get(gram) ?? 0;
    const lift = (support / D) / ((fp / P) + 1e-6);
    if (lift < 3) continue; // must be much more typical of dismissals
    cands.push({ gram, kind, support, fp, lift });
  }
}
consider(dGrams.bi, pGrams.bi, "phrase");
consider(dGrams.uni, pGrams.uni, "word");

cands.sort((a, b) => b.support * b.lift - a.support * a.lift);

console.log(`\nCandidate filter signals (common in dismissals, rare in published):`);
console.log(`(support = dismissals matched, fp = published that would also match)\n`);
if (cands.length === 0) {
  console.log("No strong signals yet. More decisions will surface clearer patterns.");
} else {
  for (const c of cands.slice(0, 25)) {
    console.log(
      `  [${c.kind}] "${c.gram}"  support=${c.support}  fp=${c.fp}  lift=${c.lift.toFixed(1)}`,
    );
  }
  console.log(`\nReview these with Claude before adding any to claim-quality.ts. High support + low fp = safest.`);
}
await prisma.$disconnect();
process.exit(0);
