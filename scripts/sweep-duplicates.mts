#!/usr/bin/env tsx
/**
 * De-duplicate near-identical claims that pollute profiles + the Telegram channel.
 *
 * The pipeline creates a fresh claim every time a statement is re-reported (across
 * days / sources) or chopped into overlapping fragments, so the same thing shows up
 * multiple times. This sweep clusters VISIBLE claims (status=published &
 * editorApproved=true) per politician and resolves each cluster:
 *
 *   - TIGHT (exact dup, or a clear fragment/substring of a fuller quote) + SAME verdict
 *       -> keep the fullest quote, hide the rest (editorApproved=false + correctionNote),
 *          matching the existing "הוסר עקב מיזוג" convention. Hidden claims drop off the
 *          site, profiles, and Telegram eligibility, and surface on /corrections.
 *   - TIGHT but verdicts CONFLICT (e.g. same line rated true AND half-true)
 *       -> route ALL members to the review queue (status="review") for a human to pick
 *          the correct verdict. We never auto-choose between conflicting verdicts.
 *   - LOOSE (token-similar but not a clear fragment) -> leave alone, just report. These
 *          may be genuinely distinct claims; not safe to auto-merge.
 *
 * Dry run by default; pass --apply to write. Read-only without --apply.
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
  } catch {}
}
forceLoadEnv("DATABASE_URL");
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");

type C = {
  id: string; pid: string; pname: string; quote: string; verdict: string;
  confidence: number | null; date: Date;
};
const raw = await prisma.claim.findMany({
  where: { status: "published", editorApproved: true },
  select: {
    id: true, politicianId: true, quote: true, verdict: true, confidence: true, date: true,
    politician: { select: { name: true } },
  },
});
const claims: C[] = raw.map((c) => ({
  id: c.id, pid: c.politicianId, pname: c.politician.name, quote: c.quote,
  verdict: c.verdict, confidence: c.confidence, date: c.date,
}));

const norm = (s: string) => s.replace(/["'״׳.,:;!?\-–—()\[\]]/g, "").replace(/\s+/g, " ").trim();
const tokens = (s: string) => new Set(norm(s).split(" ").filter((w) => w.length > 1));
const jaccard = (a: Set<string>, b: Set<string>) => {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter || 1);
};
const isFragmentOf = (m: C, full: C) => {
  const nm = norm(m.quote), nf = norm(full.quote);
  return nm.length >= 15 && nf.includes(nm); // exact (nm===nf) or substring of the fuller
};
function near(a: C, b: C): boolean {
  const na = norm(a.quote), nb = norm(b.quote);
  if (na === nb) return true;
  const short = na.length < nb.length ? na : nb, long = na.length < nb.length ? nb : na;
  if (short.length >= 15 && long.includes(short)) return true;
  return jaccard(tokens(a.quote), tokens(b.quote)) >= 0.6;
}

const byPol = new Map<string, C[]>();
for (const c of claims) {
  if (!byPol.has(c.pid)) byPol.set(c.pid, []);
  byPol.get(c.pid)!.push(c);
}

type Plan = { kind: "collapse" | "review" | "loose"; pname: string; full: C; members: C[] };
const plans: Plan[] = [];
for (const [, list] of byPol) {
  const clusters: C[][] = [];
  for (const c of list) {
    let placed = false;
    for (const cl of clusters) if (cl.some((m) => near(m, c))) { cl.push(c); placed = true; break; }
    if (!placed) clusters.push([c]);
  }
  for (const cl of clusters) {
    if (cl.length < 2) continue;
    // fullest quote is the keeper candidate
    const full = cl.slice().sort((a, b) => norm(b.quote).length - norm(a.quote).length ||
      (b.confidence ?? 0) - (a.confidence ?? 0) || (b.date > a.date ? 1 : -1))[0];
    const others = cl.filter((c) => c.id !== full.id);
    const tight = others.every((m) => isFragmentOf(m, full));
    const sameVerdict = cl.every((c) => c.verdict === cl[0].verdict);
    if (!tight) plans.push({ kind: "loose", pname: cl[0].pname, full, members: cl });
    else if (sameVerdict) plans.push({ kind: "collapse", pname: cl[0].pname, full, members: others });
    else plans.push({ kind: "review", pname: cl[0].pname, full, members: cl });
  }
}

const collapse = plans.filter((p) => p.kind === "collapse");
const review = plans.filter((p) => p.kind === "review");
const loose = plans.filter((p) => p.kind === "loose");
const hideCount = collapse.reduce((n, p) => n + p.members.length, 0);
const reviewCount = review.reduce((n, p) => n + p.members.length, 0);

console.log(`Visible claims scanned: ${claims.length}`);
console.log(`\nPLAN (${APPLY ? "APPLYING" : "dry run"}):`);
console.log(`  COLLAPSE: ${collapse.length} clusters -> hide ${hideCount} redundant fragment/exact dups (keep fullest, same verdict)`);
console.log(`  REVIEW:   ${review.length} clusters -> move ${reviewCount} claims to the review queue (conflicting verdicts)`);
console.log(`  LOOSE:    ${loose.length} clusters left untouched (similar but not clear dups)`);

const trunc = (s: string, n = 80) => (s.length > n ? s.slice(0, n) + "…" : s);
console.log(`\n--- COLLAPSE detail (keep ✓, hide ✗) ---`);
for (const p of collapse.slice(0, 40)) {
  console.log(`[${p.full.verdict}] ${p.pname}`);
  console.log(`   ✓ ${p.full.id}: ${trunc(p.full.quote)}`);
  for (const m of p.members) console.log(`   ✗ ${m.id}: ${trunc(m.quote)}`);
}
if (collapse.length > 40) console.log(`   …and ${collapse.length - 40} more collapse clusters`);

console.log(`\n--- REVIEW detail (conflicting verdicts -> all to review) ---`);
for (const p of review) {
  console.log(`${p.pname}`);
  for (const m of p.members) console.log(`   [${m.verdict}] ${m.id}: ${trunc(m.quote)}`);
}

console.log(`\n--- LOOSE detail (left alone) ---`);
for (const p of loose.slice(0, 30)) {
  console.log(`${p.pname}: ${p.members.map((m) => `[${m.verdict}]`).join(" ")}`);
  for (const m of p.members) console.log(`     ${m.id}: ${trunc(m.quote)}`);
}
if (loose.length > 30) console.log(`   …and ${loose.length - 30} more loose clusters`);

if (APPLY) {
  const now = new Date();
  let hidden = 0, reviewed = 0;
  for (const p of collapse) {
    for (const m of p.members) {
      await prisma.claim.update({
        where: { id: m.id },
        data: {
          editorApproved: false,
          correctionNote: "הוסר עקב כפילות: הציטוט הוא חלק מאמירה ארוכה יותר או חזרה על טענה שכבר מופיעה באתר. נשמרה הגרסה המלאה.",
          correctedAt: now,
          verifierNotes: `auto-dedup: merged into ${p.full.id}`,
        },
      });
      hidden++;
    }
  }
  for (const p of review) {
    const ids = p.members.map((m) => m.id).join(", ");
    const verdicts = [...new Set(p.members.map((m) => m.verdict))].join("/");
    for (const m of p.members) {
      await prisma.claim.update({
        where: { id: m.id },
        data: {
          status: "review",
          verifierNotes: `כפילות עם פסקים סותרים (${verdicts}); קבוצה: ${ids}. לבחור פסק נכון ולדחות את השאר.`,
        },
      });
      reviewed++;
    }
  }
  console.log(`\nAPPLIED: hid ${hidden} duplicates, moved ${reviewed} to review.`);
} else {
  console.log(`\nDry run — pass --apply to write.`);
}
await prisma.$disconnect();
