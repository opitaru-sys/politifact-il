"use client";

/**
 * "בדוק היומי" — daily 5-claim true/half/false game. Adapted from the user's
 * "Guess the Sub" daily-puzzle pattern: same 5 claims for everyone per UTC day,
 * one guess each, reveal the real verdict + a link to the full fact-check (the
 * conversion hook), then a shareable Wordle-style result. A localStorage guard
 * makes it once-a-day and shows your result on return.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePostHog } from "posthog-js/react";
import { VERDICT_LABEL_HE } from "@/lib/feed";
import { quizShareText, shareQuiz } from "@/lib/quiz-share";
import type { QuizClaim } from "@/lib/daily-quiz";

type Verdict = "true" | "half-true" | "false";
const VERDICTS: Verdict[] = ["true", "half-true", "false"];
const VERDICT_VAR: Record<Verdict, string> = {
  true: "var(--verdict-true)",
  "half-true": "var(--verdict-half)",
  false: "var(--verdict-false)",
};

interface Answer {
  guess: Verdict;
  correct: boolean;
}

interface Props {
  dayNumber: number;
  dateKey: string;
  claims: QuizClaim[];
}

export function QuizGame({ dayNumber, dateKey, claims }: Props) {
  const posthog = usePostHog();
  const storageKey = `bduk_quiz_${dateKey}`;

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);
  const [shareLabel, setShareLabel] = useState("שתפו את התוצאה");

  // On mount: restore a completed result (already played today) or log start.
  // SSR-safe by design — reading localStorage in a render-time initializer
  // would diverge from the server HTML and cause a hydration mismatch, so the
  // post-mount setState here is intentional.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as { answers?: Answer[] };
        if (Array.isArray(parsed.answers) && parsed.answers.length === claims.length) {
          setAnswers(parsed.answers);
          setDone(true);
          return;
        }
      }
    } catch {
      /* ignore */
    }
    posthog?.capture("quiz_start", { dayNumber, dateKey });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function choose(guess: Verdict) {
    if (revealed || done) return;
    const correct = guess === claims[index].verdict;
    setAnswers((prev) => [...prev, { guess, correct }]);
    setRevealed(true);
    posthog?.capture("quiz_answer", {
      dayNumber,
      index,
      guess,
      actual: claims[index].verdict,
      correct,
    });
  }

  function advance() {
    if (index + 1 >= claims.length) {
      setDone(true);
      const score = answers.filter((a) => a.correct).length;
      posthog?.capture("quiz_complete", { dayNumber, score, total: claims.length });
      try {
        localStorage.setItem(storageKey, JSON.stringify({ answers }));
      } catch {
        /* ignore */
      }
    } else {
      setIndex((i) => i + 1);
      setRevealed(false);
    }
  }

  async function onShare() {
    const results = answers.map((a) => a.correct);
    const res = await shareQuiz(quizShareText(dayNumber, results));
    if (res === "copied") setShareLabel("הועתק! הדביקו ושתפו");
    else if (res === "shared") setShareLabel("שותף, תודה");
    else setShareLabel("העתקה נכשלה");
    posthog?.capture("quiz_share", { dayNumber, result: res });
  }

  // ----- Results screen -----
  if (done) {
    const score = answers.filter((a) => a.correct).length;
    return (
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-6">
          <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-2">
            בדוק היומי #{dayNumber}
          </div>
          <div className="text-5xl font-black tracking-tight">
            {score}/{claims.length}
          </div>
          <p className="text-foreground-muted mt-2 text-sm">
            {score === claims.length
              ? "מושלם. אתם באמת יודעים להבחין."
              : score === 0
              ? "יום קשה. מחר יש עוד הזדמנות."
              : "לא רע. נראה אתכם מחר שוב."}
          </p>
        </div>

        {/* On-site result grid — colored squares, no emoji (those are only in
            the share text). */}
        <div className="flex justify-center gap-1.5 mb-6">
          {answers.map((a, i) => (
            <div
              key={i}
              className="w-8 h-8"
              style={{
                background: a.correct ? "var(--verdict-true)" : "var(--verdict-false)",
                borderRadius: 3,
              }}
              title={a.correct ? "נכון" : "טעות"}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={onShare}
          className="w-full bg-accent text-white font-bold py-3 hover:opacity-90 cursor-pointer"
          style={{ borderRadius: 4 }}
        >
          {shareLabel}
        </button>

        {/* Per-claim recap with links to the real fact-checks (the conversion). */}
        <div className="mt-6 space-y-2">
          {claims.map((c, i) => {
            const a = answers[i];
            return (
              <a
                key={c.id}
                href={`/claim/${c.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-card border border-border p-3 hover:border-accent transition-colors"
                style={{ borderRadius: 4 }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider text-white px-1.5 py-0.5"
                    style={{ background: a?.correct ? "var(--verdict-true)" : "var(--verdict-false)", borderRadius: 2 }}
                  >
                    {a?.correct ? "ניחשתם נכון" : "טעות"}
                  </span>
                  <span className="text-[11px] text-foreground-muted">
                    הפסק: {VERDICT_LABEL_HE[c.verdict]}
                  </span>
                </div>
                <div className="text-[13px] text-foreground line-clamp-2">
                  &ldquo;{c.quote}&rdquo; — {c.politicianName}
                </div>
                <div className="text-[11px] text-accent mt-1">קראו את הבדיקה המלאה ←</div>
              </a>
            );
          })}
        </div>

        <Link
          href="/leaderboard"
          className="block text-center mt-6 border border-border-strong py-3 font-bold hover:bg-card transition-colors"
          style={{ borderRadius: 4 }}
        >
          מי הפוליטיקאי הכי מדויק? לדירוג המלא ←
        </Link>
        <p className="text-center text-[11px] text-foreground-muted mt-3">
          חידה חדשה כל יום. חזרו מחר.
        </p>
      </div>
    );
  }

  // ----- Question screen -----
  const c = claims[index];
  return (
    <div className="max-w-xl mx-auto">
      {/* Progress */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold">
          בדוק היומי #{dayNumber}
        </div>
        <div className="flex gap-1">
          {claims.map((_, i) => (
            <div
              key={i}
              className="w-6 h-1.5"
              style={{
                background:
                  i < answers.length
                    ? answers[i].correct
                      ? "var(--verdict-true)"
                      : "var(--verdict-false)"
                    : i === index
                    ? "var(--foreground)"
                    : "var(--border-strong)",
                borderRadius: 2,
              }}
            />
          ))}
        </div>
      </div>

      <p className="text-sm text-foreground-muted mb-2">
        שאלה {index + 1} מתוך {claims.length} · אמת, חצי אמת, או שקר?
      </p>

      {/* The claim */}
      <div className="bg-card border border-border p-5 mb-4" style={{ borderRadius: 4 }}>
        <blockquote className="text-lg leading-relaxed text-foreground border-r-2 border-accent pr-3">
          &ldquo;{c.quote}&rdquo;
        </blockquote>
        <div className="text-[13px] text-foreground-muted mt-3">
          — {c.politicianName} · {c.politicianParty}
        </div>
      </div>

      {/* Verdict buttons */}
      <div className="grid grid-cols-3 gap-2">
        {VERDICTS.map((v) => {
          const isCorrect = revealed && v === c.verdict;
          const isWrongPick =
            revealed && answers[index]?.guess === v && v !== c.verdict;
          return (
            <button
              key={v}
              type="button"
              onClick={() => choose(v)}
              disabled={revealed}
              className="py-3 font-bold text-white text-sm transition-opacity disabled:cursor-default cursor-pointer"
              style={{
                background: VERDICT_VAR[v],
                borderRadius: 4,
                opacity: revealed && !isCorrect && !isWrongPick ? 0.35 : 1,
                outline: isCorrect ? "3px solid var(--foreground)" : "none",
                outlineOffset: 2,
              }}
            >
              {VERDICT_LABEL_HE[v]}
              {isWrongPick ? " ✗" : ""}
              {isCorrect ? " ✓" : ""}
            </button>
          );
        })}
      </div>

      {/* Reveal */}
      {revealed && (
        <div className="mt-4 bg-card border border-border p-4" style={{ borderRadius: 4 }}>
          <div className="text-sm font-bold mb-1">
            {answers[index]?.correct ? "ניחשתם נכון." : "לא הפעם."} הפסק:{" "}
            <span style={{ color: VERDICT_VAR[c.verdict] }}>{VERDICT_LABEL_HE[c.verdict]}</span>
          </div>
          <p className="text-[13px] text-foreground-muted leading-relaxed">{c.summary}</p>
          <div className="flex items-center justify-between mt-3 gap-3 flex-wrap">
            <a
              href={`/claim/${c.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-accent font-bold"
            >
              קראו את הבדיקה המלאה ←
            </a>
            <button
              type="button"
              onClick={advance}
              className="bg-accent text-white font-bold text-sm py-2 px-5 hover:opacity-90 cursor-pointer"
              style={{ borderRadius: 4 }}
            >
              {index + 1 >= claims.length ? "לתוצאה" : "הבא"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
