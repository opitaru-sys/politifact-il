/**
 * Daily quiz selection for "בדוק היומי" (the /quiz game) — "who said it?".
 *
 * Everyone gets the SAME 5 questions per UTC day (that's what makes the shared
 * score comparable, Wordle's engine). Each question is a real quote plus 4
 * politician options (the real speaker + 3 distractors). Selection AND the
 * options are deterministic from the date (one seeded RNG threaded through the
 * whole pick), over a pool frozen to claims that existed before today, so a
 * claim added mid-day can't shift the puzzle. Computed from the DB; the route
 * caches the result for the day.
 *
 * "Who said it" instead of guess-the-verdict because the truth of a bare quote
 * usually can't be reasoned out without the sources — but the speaker often
 * can (style, content, known positions). The reveal still surfaces our verdict
 * + a link to the full fact-check, so the fact-checking rides along.
 */
import { prisma } from "@/lib/db";
import { cachedRead } from "@/lib/cache";

export interface QuizOption {
  name: string;
  party: string;
}

export interface QuizQuestion {
  id: string; // claim id (for the "read the full fact-check" link)
  quote: string;
  verdict: "true" | "half-true" | "false";
  summary: string;
  answer: QuizOption; // the real speaker
  options: QuizOption[]; // 4, shuffled, includes the answer
}

export interface DailyQuiz {
  dayNumber: number;
  dateKey: string; // YYYY-MM-DD (UTC)
  questions: QuizQuestion[];
}

export const QUIZ_SIZE = 5;
const OPTION_COUNT = 4;

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

// Deterministic PRNG (mulberry32) seeded from the date string.
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

async function selectDailyQuestionsUncached(
  dateKey: string,
): Promise<QuizQuestion[]> {
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
      politician: { select: { id: true, name: true, party: true } },
    },
  });

  // The set of politicians who appear in the data — the pool we draw the
  // wrong-answer options from (recognizable names, not random unknowns).
  const peopleById = new Map<string, QuizOption>();
  for (const c of pool) {
    if (!peopleById.has(c.politician.id)) {
      peopleById.set(c.politician.id, {
        name: c.politician.name,
        party: c.politician.party,
      });
    }
  }
  const allPeople = [...peopleById.entries()]; // [id, option][]

  // Eligible questions: real summary, a quote that reads well, and — crucially
  // — a quote that does NOT contain the speaker's name (that would give the
  // answer away).
  const eligible = pool.filter((c) => {
    if (!c.summary || c.summary.trim().length === 0) return false;
    if (c.quote.length < 12 || c.quote.length > 240) return false;
    const nameTokens = c.politician.name.split(/\s+/).filter((t) => t.length >= 3);
    if (nameTokens.some((t) => c.quote.includes(t))) return false;
    return true;
  });

  const rng = seededRng(dateKey);
  const shuffled = seededShuffle(eligible, rng);

  const questions: QuizQuestion[] = [];
  const usedPoliticians = new Set<string>();
  for (const c of shuffled) {
    if (questions.length >= QUIZ_SIZE) break;
    if (usedPoliticians.has(c.politician.id)) continue; // 5 distinct speakers

    const distractorPool = allPeople.filter(([id]) => id !== c.politician.id);
    const distractors = seededShuffle(distractorPool, rng)
      .slice(0, OPTION_COUNT - 1)
      .map(([, opt]) => opt);
    if (distractors.length < OPTION_COUNT - 1) continue; // need enough people

    const answer: QuizOption = {
      name: c.politician.name,
      party: c.politician.party,
    };
    const options = seededShuffle([answer, ...distractors], rng);

    questions.push({
      id: c.id,
      quote: c.quote,
      verdict: c.verdict as QuizQuestion["verdict"],
      summary: c.summary as string,
      answer,
      options,
    });
    usedPoliticians.add(c.politician.id);
  }

  return questions;
}

// Cache the day's questions so a viral /quiz doesn't re-query the claim pool on
// every request. Payload is Date-free (cacheable); dateKey is passed as an
// argument so it's part of the cache key — the cache busts on its own at UTC
// midnight, and on any claim change via the "claims" tag.
const selectDailyQuestions = cachedRead(
  selectDailyQuestionsUncached,
  ["daily-quiz"],
  { revalidate: 600, tags: ["claims"] },
);

export async function getDailyQuiz(date = new Date()): Promise<DailyQuiz> {
  const dateKey = todayKeyUTC(date);
  const dayNumber = quizDayNumber(date);
  const questions = await selectDailyQuestions(dateKey);
  return { dayNumber, dateKey, questions };
}
