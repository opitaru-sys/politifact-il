/**
 * Daily quiz selection for "בדוק היומי" (the /quiz game).
 *
 * Everyone gets the SAME 5 claims per UTC day — that's what makes the shared
 * score comparable (Wordle's engine). Selection is deterministic from the date
 * (seeded shuffle), over a pool frozen to claims that existed before today, so
 * a claim added mid-day can't shift today's puzzle. No cron / static files
 * needed — computed from the DB on request (the route caches it for the day).
 */
import { prisma } from "@/lib/db";

export interface QuizClaim {
  id: string;
  quote: string;
  verdict: "true" | "half-true" | "false";
  summary: string;
  politicianName: string;
  politicianParty: string;
}

export interface DailyQuiz {
  dayNumber: number;
  dateKey: string; // YYYY-MM-DD (UTC)
  claims: QuizClaim[];
}

export const QUIZ_SIZE = 5;

// Launch day for the "#N" counter shown in the share text.
const EPOCH_UTC = Date.UTC(2026, 4, 30); // 2026-05-30

export function quizDayNumber(date = new Date()): number {
  const todayUTC = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  return Math.max(1, Math.floor((todayUTC - EPOCH_UTC) / 86_400_000) + 1);
}

export function todayKeyUTC(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

// Deterministic PRNG (mulberry32) seeded from the date string, so the same day
// always yields the same shuffle.
function seededRng(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function getDailyQuiz(date = new Date()): Promise<DailyQuiz> {
  const dateKey = todayKeyUTC(date);
  const dayNumber = quizDayNumber(date);
  const startOfToday = new Date(`${dateKey}T00:00:00.000Z`);

  const pool = await prisma.claim.findMany({
    where: {
      status: "published",
      editorApproved: true,
      createdAt: { lt: startOfToday },
      summary: { not: null },
    },
    select: {
      id: true,
      quote: true,
      verdict: true,
      summary: true,
      politician: { select: { name: true, party: true } },
    },
  });

  // Keep claims that read well as a quiz question: a real summary and a quote
  // that isn't a fragment or a wall of text.
  const eligible = pool.filter(
    (c) =>
      !!c.summary &&
      c.summary.trim().length > 0 &&
      c.quote.length >= 12 &&
      c.quote.length <= 240,
  );

  const rng = seededRng(dateKey);
  const shuffled = seededShuffle(eligible, rng);

  // Pick QUIZ_SIZE with variety: at most 2 per verdict and 1 per politician, so
  // a day is never all-"true" or dominated by one figure.
  const picked: typeof shuffled = [];
  const verdictCount: Record<string, number> = {};
  const usedPoliticians = new Set<string>();
  for (const c of shuffled) {
    if (picked.length >= QUIZ_SIZE) break;
    if ((verdictCount[c.verdict] ?? 0) >= 2) continue;
    if (usedPoliticians.has(c.politician.name)) continue;
    picked.push(c);
    verdictCount[c.verdict] = (verdictCount[c.verdict] ?? 0) + 1;
    usedPoliticians.add(c.politician.name);
  }
  // Relax the caps if a small dataset couldn't fill the quiz.
  if (picked.length < QUIZ_SIZE) {
    for (const c of shuffled) {
      if (picked.length >= QUIZ_SIZE) break;
      if (!picked.includes(c)) picked.push(c);
    }
  }

  return {
    dayNumber,
    dateKey,
    claims: picked.map((c) => ({
      id: c.id,
      quote: c.quote,
      verdict: c.verdict as QuizClaim["verdict"],
      summary: c.summary as string,
      politicianName: c.politician.name,
      politicianParty: c.politician.party,
    })),
  };
}
