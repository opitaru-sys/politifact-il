#!/usr/bin/env tsx
/** Repair malformed `{{P:name}}` (no pipe) markers in TopicInsight + Digest
 *  bodies. AI sometimes emits the short form despite the prompt; the new
 *  post-processor in topic-insight-synthesis catches it going forward but
 *  existing rows need a one-off pass. Idempotent — well-formed markers
 *  pass through unchanged. */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;
const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();

const APPLY = process.argv.includes("--apply");

const { repairPoliticianMarkers } = await import("../src/lib/insight-markup");

// Build name↔id maps from every politician in DB. Repair uses this as the
// authoritative source — we don't trust the AI to know slugs.
const allPols = await p.politician.findMany({ select: { id: true, name: true } });
const nameToId = new Map(allPols.map((x) => [x.name, x.id]));
const idToName = new Map(allPols.map((x) => [x.id, x.name]));

function hasBrokenMarkers(s: string): boolean {
  // `{{P:X}}` without a pipe inside
  return /\{\{P:[^|}]+\}\}/.test(s);
}

let touched = 0;

const topics = await p.topicInsight.findMany({ select: { id: true, slug: true, body: true } });
for (const t of topics) {
  if (!hasBrokenMarkers(t.body)) continue;
  const repaired = repairPoliticianMarkers(t.body, nameToId, idToName);
  if (repaired === t.body) continue;
  console.log(`TopicInsight[${t.slug}]: ${(t.body.match(/\{\{P:[^|}]+\}\}/g) || []).length} broken markers`);
  if (APPLY) {
    await p.topicInsight.update({ where: { id: t.id }, data: { body: repaired } });
  }
  touched++;
}

// Digest model stores sections as JSON ({ type, heading, body, ... }). Walk
// each section's body string and repair in place.
const digests = await p.digest.findMany({ select: { id: true, weekOf: true, sections: true } });
for (const d of digests) {
  const sections = d.sections as Array<{ body?: string; [k: string]: unknown }>;
  if (!Array.isArray(sections)) continue;
  let mutated = false;
  let brokenCount = 0;
  const repairedSections = sections.map((s) => {
    if (typeof s?.body !== "string" || !hasBrokenMarkers(s.body)) return s;
    brokenCount += (s.body.match(/\{\{P:[^|}]+\}\}/g) || []).length;
    const repaired = repairPoliticianMarkers(s.body, nameToId, idToName);
    if (repaired !== s.body) {
      mutated = true;
      return { ...s, body: repaired };
    }
    return s;
  });
  if (!mutated) continue;
  console.log(`Digest[${d.weekOf.toISOString().slice(0, 10)}]: ${brokenCount} broken markers across ${sections.length} sections`);
  if (APPLY) {
    // Prisma's InputJsonValue type requires the value to satisfy its
    // narrow JSON-shape signature. Our walked sections are structurally
    // identical to what we read out, so cast through unknown.
    await p.digest.update({
      where: { id: d.id },
      data: { sections: repairedSections as unknown as object },
    });
  }
  touched++;
}

console.log(`\n${touched} rows ${APPLY ? "repaired" : "would be repaired"}.`);
if (!APPLY) console.log("--apply to commit.");
await p.$disconnect();
