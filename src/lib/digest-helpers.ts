/**
 * Shared helpers for digest pages — fetching the claim + topic context
 * referenced by digest sections so the renderer can show them inline.
 *
 * Lives in lib (not in the page file) because both /digest and
 * /digest/[weekOf] need the same logic; the renderer is dumb on
 * purpose so it can also be reused from the admin preview.
 */
import { prisma } from "./db";
import { listCanonicalTopics } from "./topics";
import type { DigestSection } from "@/components/DigestRenderer";

export async function buildDigestContext(sections: DigestSection[]) {
  const claimIds = new Set<string>();
  const topicSlugs = new Set<string>();
  for (const s of sections) {
    if (s.claimId) claimIds.add(s.claimId);
    if (s.topicSlug) topicSlugs.add(s.topicSlug);
  }

  const claims =
    claimIds.size > 0
      ? await prisma.claim.findMany({
          where: { id: { in: Array.from(claimIds) } },
          include: { politician: true },
        })
      : [];

  const claimMap = new Map<
    string,
    {
      id: string;
      quote: string;
      verdict: string;
      summary: string | null;
      politicianName: string;
      politicianId: string;
      politicianImage: string | null;
      party: string;
    }
  >();
  for (const c of claims) {
    claimMap.set(c.id, {
      id: c.id,
      quote: c.quote,
      verdict: c.verdict,
      summary: c.summary,
      politicianName: c.politician.name,
      politicianId: c.politician.id,
      politicianImage: c.politician.image,
      party: c.politician.party,
    });
  }

  // Topics are static — just look up labels.
  const topicMap = new Map<string, string>();
  for (const { slug, label } of listCanonicalTopics()) {
    if (topicSlugs.has(slug)) topicMap.set(slug, label);
  }

  return { claimMap, topicMap };
}

/** Format a Friday date as a YYYY-MM-DD slug. */
export function digestSlug(weekOf: Date): string {
  return weekOf.toISOString().slice(0, 10);
}

/** Parse YYYY-MM-DD back to a Date at noon UTC. */
export function parseDigestSlug(slug: string): Date | null {
  const d = new Date(slug);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCHours(12, 0, 0, 0);
  return d;
}
