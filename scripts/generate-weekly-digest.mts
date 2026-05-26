#!/usr/bin/env tsx
/**
 * Generate (or refresh) the weekly digest DRAFT.
 *
 * Anchors at the most recent Friday by default. Pass --week YYYY-MM-DD
 * to target a specific Friday. Idempotent via the Digest.weekOf unique
 * constraint — re-running for the same week updates the draft rather
 * than creating a duplicate.
 *
 * What it computes:
 *   1. Movers — top 3 gainers + top 3 losers (7-day delta)
 *   2. Top "false" claim of the week — highest-confidence שקר verdict
 *   3. Most-debated topic — canonical topic with the most claims this week
 *   4. Headline stats — total claims + politicians active this week
 *
 * Writes a Digest row with status="draft". Admin reviews + edits + flips
 * to "published" via /admin/digest before it appears on /digest.
 *
 * Once the admin workflow proves stable, schedule this in GitHub Actions
 * for early Friday morning UTC.
 */
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const { getBiggestMovers } = await import("../src/lib/cred-history");
const { listCanonicalTopics, rawTopicMatchesSlug } = await import("../src/lib/topics");

const prisma = new PrismaClient();

function getLastFriday(): Date {
  const d = new Date();
  const day = d.getUTCDay(); // 0=Sun, 5=Fri
  const diff = (day - 5 + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(12, 0, 0, 0); // noon UTC, avoids DST/timezone fence-post bugs
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
const weekOf = parseWeekOf();
const weekStart = new Date(weekOf);
weekStart.setUTCDate(weekStart.getUTCDate() - 7);

const dateLabel = weekOf.toLocaleDateString("he-IL", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

console.log(`Generating weekly digest for week ending ${weekOf.toISOString().slice(0, 10)} (${dateLabel})`);
console.log(`Week range: ${weekStart.toISOString().slice(0, 10)} → ${weekOf.toISOString().slice(0, 10)}\n`);

// ─── Section 1: Movers (7-day) ───────────────────────────────────────
const movers = await getBiggestMovers({ daysBack: 7, minSample: 10, topN: 3 });
console.log(`Movers: ${movers.gainers.length} gainers · ${movers.losers.length} losers`);

// ─── Section 2: Top "false" claim of the week ────────────────────────
const weekClaims = await prisma.claim.findMany({
  where: {
    status: "published",
    editorApproved: true,
    date: { gte: weekStart, lte: weekOf },
  },
  include: { politician: true },
});
console.log(`Week's published claims: ${weekClaims.length}`);

const falseOnes = weekClaims
  .filter((c) => c.verdict === "false")
  .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
const topFalse = falseOnes[0] ?? null;
if (topFalse) {
  console.log(`Top false: "${topFalse.quote.slice(0, 60)}" (${topFalse.politician.name})`);
}

// ─── Section 3: Most-debated canonical topic ─────────────────────────
const topicCounts = new Map<string, { slug: string; label: string; count: number }>();
for (const c of weekClaims) {
  for (const { slug, label } of listCanonicalTopics()) {
    if (rawTopicMatchesSlug(c.topic, slug)) {
      const existing = topicCounts.get(slug);
      if (existing) existing.count++;
      else topicCounts.set(slug, { slug, label, count: 1 });
      break; // count each claim under exactly one canonical topic
    }
  }
}
const topicRanked = Array.from(topicCounts.values()).sort((a, b) => b.count - a.count);
const topTopic = topicRanked[0] ?? null;
console.log(`Top topic: ${topTopic ? `${topTopic.label} (${topTopic.count} claims)` : "none"}`);

// ─── Section 4: Headline stats ───────────────────────────────────────
const distinctPoliticians = new Set(weekClaims.map((c) => c.politicianId)).size;
const verdictCounts = {
  true: weekClaims.filter((c) => c.verdict === "true").length,
  half: weekClaims.filter((c) => c.verdict === "half-true").length,
  false: weekClaims.filter((c) => c.verdict === "false").length,
};

// ─── Build the sections JSON ─────────────────────────────────────────
interface MoverItem {
  politicianId: string;
  politicianName: string;
  party: string;
  image: string | null;
  delta: number;
  currentScore: number;
  previousScore: number;
}
interface Section {
  type: string;
  heading: string;
  body: string;
  items?: MoverItem[];
  claimId?: string;
  topicSlug?: string;
}

const sections: Section[] = [];

sections.push({
  type: "headline_stats",
  heading: "השבוע במספרים",
  body: `${weekClaims.length} טענות נבדקו ב-7 הימים האחרונים, של ${distinctPoliticians} פוליטיקאים. ` +
    `${verdictCounts.true} סווגו אמת, ${verdictCounts.half} חצי-אמת, ${verdictCounts.false} שקר.`,
});

if (movers.gainers.length > 0 || movers.losers.length > 0) {
  const items: MoverItem[] = [];
  for (const g of movers.gainers) {
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
  for (const l of movers.losers) {
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
    heading: "מי עלה ומי ירד באמינות",
    body:
      `דירוג השינויים של 7 הימים האחרונים. מינימום 10 טענות בכל חלון של 30 הימים שמשמש לחישוב הציון.`,
    items,
  });
}

if (topFalse) {
  sections.push({
    type: "claim",
    heading: "הטענה השקרית הבולטת השבוע",
    body: `"${topFalse.quote}" — ${topFalse.politician.name} (${topFalse.politician.party}). ${topFalse.summary ?? ""}`.trim(),
    claimId: topFalse.id,
  });
}

if (topTopic && topTopic.count >= 3) {
  sections.push({
    type: "topic",
    heading: "הנושא שלא ירד מהכותרות",
    body: `${topTopic.label} זכה השבוע ל-${topTopic.count} טענות נבדקות — יותר מכל נושא אחר. ראה את כל הפוליטיקאים בנושא.`,
    topicSlug: topTopic.slug,
  });
}

const title = `השבוע באמינות · ${dateLabel}`;
const intro =
  `סיכום אוטומטי של מה שקרה השבוע בעולם בדיקת העובדות הפוליטיות: מי עלה ומי ירד באמינות, ` +
  `מה הייתה הטענה השקרית הבולטת, ומה הנושא שהעסיק את הפוליטיקאים. הסיכום נערך על ידי עורך לפני פרסום.`;

console.log(`\nDraft summary:`);
console.log(`  title: ${title}`);
console.log(`  intro: ${intro.slice(0, 80)}...`);
console.log(`  sections: ${sections.length}`);
for (const s of sections) {
  console.log(`    - [${s.type}] ${s.heading}`);
}

if (!APPLY) {
  console.log(`\nDry-run. Re-run with --apply to upsert as draft.`);
  await prisma.$disconnect();
  process.exit(0);
}

// Upsert: if a digest for this weekOf exists and is still in draft,
// update it. If it's already published, refuse to overwrite (the admin
// has shipped this issue; regenerating would silently destroy edits).
const existing = await prisma.digest.findUnique({ where: { weekOf } });
if (existing && existing.status === "published") {
  console.error(`\n✗ A published digest for ${weekOf.toISOString().slice(0, 10)} already exists. Refusing to overwrite.`);
  console.error(`  If you really want to regenerate, set its status back to "draft" via /admin/digest first.`);
  await prisma.$disconnect();
  process.exit(1);
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
