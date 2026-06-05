#!/usr/bin/env tsx
/**
 * Generate (or refresh) the weekly digest DRAFT.
 *
 * Pipeline (rewritten 2026-05-26 after the "bare-bones" feedback):
 *   1. analyzeWeek()    — compute structured patterns
 *   2. synthesizeDigest() — Gemini turns patterns into journalist-voice
 *                            insight paragraphs
 *   3. Assemble sections array (insights + movers visual + topic link)
 *   4. Upsert as draft (status="draft", admin reviews + publishes)
 *
 * Anchors at the most recent Friday by default. Pass --week YYYY-MM-DD
 * to target a specific Friday. Idempotent via the Digest.weekOf unique
 * constraint — re-running for the same week updates the draft rather
 * than creating a duplicate. Refuses to overwrite a published issue.
 *
 * If the AI synthesis call fails (network, API quota, bad parse), we
 * fall back to a minimal deterministic draft so the cron never produces
 * an empty digest row. The fallback is clearly labeled in its intro.
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
    /* file missing */
  }
}
forceLoadEnv("DATABASE_URL");
forceLoadEnv("GEMINI_API_KEY");

const { PrismaClient } = await import("@prisma/client");
const { analyzeWeek } = await import("../src/lib/digest-analysis");
const { synthesizeDigest } = await import("../src/lib/digest-synthesis");
const { topicLabelToSlug } = await import("../src/lib/topics");

const prisma = new PrismaClient();

function getLastFriday(): Date {
  const d = new Date();
  const day = d.getUTCDay(); // 0=Sun, 5=Fri
  const diff = (day - 5 + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(12, 0, 0, 0);
  return d;
}

function parseWeekOf(): Date {
  const idx = process.argv.indexOf("--week");
  if (idx >= 0 && process.argv[idx + 1]) {
    const d = new Date(process.argv[idx + 1]);
    if (!Number.isNaN(d.getTime())) {
      d.setUTCHours(12, 0, 0, 0);
      return d;
    }
  }
  return getLastFriday();
}

const APPLY = process.argv.includes("--apply");
/** `--force` overwrites an already-published digest. Use sparingly —
 *  it silently destroys whatever the editor approved. Intended for
 *  development / prompt-tuning iterations. */
const FORCE = process.argv.includes("--force");
const weekOf = parseWeekOf();

const dateLabel = weekOf.toLocaleDateString("he-IL", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

console.log(`Generating weekly digest for week ending ${weekOf.toISOString().slice(0, 10)} (${dateLabel})`);

// ── Step 1: Analyze ────────────────────────────────────────────────
console.log(`\nStep 1: analyzing week data...`);
const analysis = await analyzeWeek(weekOf);
console.log(`  ${analysis.totalClaims} claims / ${analysis.distinctPoliticians} politicians`);
console.log(`  truth %: ${analysis.truthPercentage}% (last week: ${analysis.prevWeekTruthPercentage ?? "n/a"})`);
console.log(`  top misleaders: ${analysis.topMisleaders.slice(0, 3).map((m) => `${m.politicianName}=${m.lieScore}`).join(", ") || "none (no one ≥3 claims)"}`);
console.log(`  movers: ${analysis.topGainers.length}↑ / ${analysis.topLosers.length}↓`);
console.log(`  topic distribution: ${analysis.topicDistribution.slice(0, 5).map((t) => `${t.label}=${t.count}`).join(", ")}`);
console.log(`  worst topic: ${analysis.worstTopic ? `${analysis.worstTopic.label} ${analysis.worstTopic.truthPercentage}%` : "n/a"}`);
console.log(`  persistence: ${analysis.persistentLow}/${analysis.totalLowLastWeek} stayed low`);
console.log(`  first-timers: ${analysis.firstTimePoliticians.length}`);

// ── Step 2: Synthesize ─────────────────────────────────────────────
console.log(`\nStep 2: AI synthesis (Gemini journalist-voice)...`);
type SectionShape = {
  type: string;
  heading: string;
  body: string;
  items?: unknown[];
  topicSlug?: string;
};

let title: string;
let intro: string;
let insightSections: SectionShape[] = [];

try {
  const synthesized = await synthesizeDigest(analysis);
  title = synthesized.title;
  intro = synthesized.intro;
  insightSections = synthesized.insights.map((ins) => ({
    type: "insight",
    heading: ins.heading,
    body: ins.body,
  }));
  console.log(`  ✓ title: ${title}`);
  console.log(`  ✓ insights: ${synthesized.insights.length}`);
  for (const i of synthesized.insights) {
    console.log(`    - ${i.heading}`);
  }
} catch (err) {
  console.error(`  ✗ synthesis failed: ${err instanceof Error ? err.message : String(err)}`);
  console.error(`  falling back to minimal deterministic draft`);
  title = `סיכום שבועי · ${dateLabel}`;
  intro =
    `הפקה אוטומטית של בסיס הנתונים השבועי. שלב הסינתזה של ה-AI נכשל; טיוטה זו דורשת עריכה ידנית לפני פרסום.`;
  insightSections = [
    {
      type: "insight",
      heading: "השבוע במספרים",
      body: `${analysis.totalClaims} טענות נבדקו ב-7 הימים האחרונים, של ${analysis.distinctPoliticians} פוליטיקאים. ${analysis.verdictCounts.true} סווגו אמת, ${analysis.verdictCounts.halfTrue} חצי-אמת, ${analysis.verdictCounts.false} שקר. ממוצע אחוז האמת המשוקלל: ${analysis.truthPercentage}%.`,
    },
  ];
}

// ── Step 3: Assemble sections ──────────────────────────────────────
// Structure: headline stats card → insight paragraphs → visual movers
// card → topic link. Editor can reorder/delete via the admin JSON.
const sections: SectionShape[] = [];

// Lead the stats card with the week's top misleader, mirroring the
// homepage hero ("המטעה המוביל"). Falls back to a clean verdict
// breakdown when no one cleared the 3-claim bar.
const leadMisleader = analysis.topMisleaders[0];
const statsBody =
  `${analysis.totalClaims} טענות · ${analysis.distinctPoliticians} פוליטיקאים · ` +
  `${analysis.verdictCounts.true} אמת · ${analysis.verdictCounts.halfTrue} חצי · ${analysis.verdictCounts.false} שקר.` +
  (leadMisleader
    ? ` המטעה המוביל השבוע: ${leadMisleader.politicianName} (ניקוד הטעיה ${leadMisleader.lieScore} מתוך ${leadMisleader.claimCount} טענות).`
    : "");
sections.push({
  type: "headline_stats",
  heading: "השבוע במספרים",
  body: statsBody,
});

sections.push(...insightSections);

if (analysis.topGainers.length > 0 || analysis.topLosers.length > 0) {
  const items: object[] = [];
  for (const g of analysis.topGainers) {
    items.push({
      politicianId: g.politician.id,
      politicianName: g.politician.name,
      party: g.politician.party,
      image: g.politician.image,
      delta: g.delta,
      currentScore: g.currentScore,
      previousScore: g.previousScore,
    });
  }
  for (const l of analysis.topLosers) {
    items.push({
      politicianId: l.politician.id,
      politicianName: l.politician.name,
      party: l.politician.party,
      image: l.politician.image,
      delta: l.delta,
      currentScore: l.currentScore,
      previousScore: l.previousScore,
    });
  }
  sections.push({
    type: "movers",
    heading: "מי השתפר ומי הידרדר בדיוק",
    body: `שינויי ציון הדיוק העובדתי (חלון נע של 30 ימים) ב-7 הימים האחרונים. מינימום 10 טענות בכל אנכור כדי להיכלל.`,
    items,
  });
}

// Topic link: only if there's a clearly dominant topic (≥20% of week's claims).
const dominantTopic = analysis.topicDistribution[0];
if (dominantTopic && dominantTopic.pctOfWeek >= 20) {
  const slug = topicLabelToSlug(dominantTopic.label) ?? dominantTopic.slug;
  sections.push({
    type: "topic",
    heading: "הנושא שהוביל את השבוע",
    body: `${dominantTopic.label} זכה ל-${dominantTopic.count} טענות, ${dominantTopic.pctOfWeek}% מסך הטענות השבוע. עברו לדף הנושא לראות את כל הפוליטיקאים שדיברו עליו.`,
    topicSlug: slug,
  });
}

console.log(`\nDraft summary:`);
console.log(`  title: ${title}`);
console.log(`  sections: ${sections.length} (${sections.map((s) => s.type).join(", ")})`);

if (!APPLY) {
  console.log(`\nDry-run. Re-run with --apply to upsert as draft.`);
  await prisma.$disconnect();
  process.exit(0);
}

// ── Step 4: Upsert ─────────────────────────────────────────────────
const existing = await prisma.digest.findUnique({ where: { weekOf } });
if (existing && existing.status === "published" && !FORCE) {
  console.error(`\n✗ A published digest for ${weekOf.toISOString().slice(0, 10)} already exists. Refusing to overwrite.`);
  console.error(`  Options:`);
  console.error(`    1. Set its status back to "draft" via /admin/digest, then re-run.`);
  console.error(`    2. Re-run with --force to overwrite (silently destroys what the editor approved).`);
  await prisma.$disconnect();
  process.exit(1);
}
if (existing && existing.status === "published" && FORCE) {
  console.warn(`\n⚠ --force given: overwriting published digest for ${weekOf.toISOString().slice(0, 10)}.`);
}

const upserted = await prisma.digest.upsert({
  where: { weekOf },
  create: {
    weekOf,
    status: "draft",
    title,
    intro,
    sections: JSON.parse(JSON.stringify(sections)) as object[],
  },
  update: {
    title,
    intro,
    sections: JSON.parse(JSON.stringify(sections)) as object[],
  },
});

console.log(`\n✓ ${existing ? "Updated" : "Created"} draft: id=${upserted.id}`);
console.log(`  Edit at /admin/digest?key=YOUR_SECRET`);
await prisma.$disconnect();
