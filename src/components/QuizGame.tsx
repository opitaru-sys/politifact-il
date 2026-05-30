"use client";

/**
 * "בדוק היומי" — daily "who said it?" game. Same 5 quotes for everyone per UTC
 * day; guess which politician said each (4 options), then the reveal shows the
 * real speaker + our verdict + a link to the full fact-check (the conversion
 * hook). A localStorage guard makes it once-a-day and shows your result on
 * return. Daily/flow/share infra adapted from the user's "Guess the Sub".
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePostHog } from "posthog-js/react";
import { VERDICT_LABEL_HE } from "@/lib/feed";
import { quizShareText, shareQuiz } from "@/lib/quiz-share";
import type { QuizQuestion } from "@/lib/daily-quiz";

const VERDICT_VAR: Record<string, string> = {
  true: "var(--verdict-true)",
  "half-true": "var(--verdict-half)",
  false: "var(--verdict-false)",
};

interface Answer {
  guess: string; // chosen politician name
  correct: boolean;
}

interface Props {
  dayNumber: number;
  dateKey: string;
  questions: QuizQuestion[];
}

export function QuizGame({ dayNumber, dateKey, questions }: Props) {
  const posthog = usePostHog();
  const storageKey = `bduk_quiz_${dateKey}`;

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);
  const [shareLabel, setShareLabel] = useState("שתפו את התוצאה");

  // On mount: restore a completed result (already played today) or log start.
  // SSR-safe by design — reading localStorage in a render-time initializer
  // would diverge from the server HTML and cause a hydration mismatch.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as { answers?: Answer[] };
        if (Array.isArray(parsed.answers) && parsed.answers.length === questions.length) {
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

  function choose(name: string) {
    if (revealed || done) return;
    const correct = name === questions[index].answer.name;
    setAnswers((prev) => [...prev, { guess: name, correct }]);
    setRevealed(true);
    posthog?.capture("quiz_answer", {
      dayNumber,
      index,
      guess: name,
      actual: questions[index].answer.name,
      correct,
    });
  }

  function advance() {
    if (index + 1 >= questions.length) {
      setDone(true);
      const score = answers.filter((a) => a.correct).length;
      posthog?.capture("quiz_complete", { dayNumber, score, total: questions.length });
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
            {score}/{questions.length}
          </div>
          <p className="text-foreground-muted mt-2 text-sm">
            {score === questions.length
              ? "מושלם. אתם מכירים אותם היטב."
              : score === 0
              ? "יום קשה. מחר יש עוד הזדמנות."
              : "לא רע. נראה אתכם מחר שוב."}
          </p>
        </div>

        {/* On-site result grid — colored squares, no emoji (those live only in
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

        {/* Per-question recap with links to the real fact-checks (the conversion). */}
        <div className="mt-6 space-y-2">
          {questions.map((q, i) => {
            const a = answers[i];
            return (
              <a
                key={q.id}
                href={`/claim/${q.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-card border border-border p-3 hover:border-accent transition-colors"
                style={{ borderRadius: 4 }}
              >
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider text-white px-1.5 py-0.5"
                    style={{ background: a?.correct ? "var(--verdict-true)" : "var(--verdict-false)", borderRadius: 2 }}
                  >
                    {a?.correct ? "ניחשתם נכון" : "טעות"}
                  </span>
                  <span className="text-[11px] text-foreground">
                    אמר/ה: <strong>{q.answer.name}</strong>
                  </span>
                  <span className="text-[11px] text-foreground-muted">
                    · הפסק: {VERDICT_LABEL_HE[q.verdict]}
                  </span>
                </div>
                <div className="text-[13px] text-foreground line-clamp-2">
                  &ldquo;{q.quote}&rdquo;
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
  const q = questions[index];
  return (
    <div className="max-w-xl mx-auto">
      {/* Progress */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold">
          בדוק היומי #{dayNumber}
        </div>
        <div className="flex gap-1">
          {questions.map((_, i) => (
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
        שאלה {index + 1} מתוך {questions.length} · מי אמר את זה?
      </p>

      {/* The quote — speaker hidden (that's the answer) */}
      <div className="bg-card border border-border p-5 mb-4" style={{ borderRadius: 4 }}>
        <blockquote className="text-lg leading-relaxed text-foreground border-r-2 border-accent pr-3">
          &ldquo;{q.quote}&rdquo;
        </blockquote>
      </div>

      {/* Politician options */}
      <div className="grid gap-2">
        {q.options.map((opt) => {
          const isCorrect = revealed && opt.name === q.answer.name;
          const isWrongPick =
            revealed && answers[index]?.guess === opt.name && opt.name !== q.answer.name;
          return (
            <button
              key={opt.name}
              type="button"
              onClick={() => choose(opt.name)}
              disabled={revealed}
              className="flex items-center justify-between py-3 px-4 border text-sm font-bold transition-colors disabled:cursor-default cursor-pointer text-right"
              style={{
                borderRadius: 4,
                borderColor: isCorrect
                  ? "var(--verdict-true)"
                  : isWrongPick
                  ? "var(--verdict-false)"
                  : "var(--border-strong)",
                background: isCorrect
                  ? "color-mix(in srgb, var(--verdict-true) 14%, transparent)"
                  : isWrongPick
                  ? "color-mix(in srgb, var(--verdict-false) 14%, transparent)"
                  : "var(--card)",
                opacity: revealed && !isCorrect && !isWrongPick ? 0.45 : 1,
              }}
            >
              <span>
                {opt.name}
                <span className="text-foreground-muted font-normal"> · {opt.party}</span>
              </span>
              <span>{isCorrect ? "✓" : isWrongPick ? "✗" : ""}</span>
            </button>
          );
        })}
      </div>

      {/* Reveal */}
      {revealed && (
        <div className="mt-4 bg-card border border-border p-4" style={{ borderRadius: 4 }}>
          <div className="text-sm font-bold mb-1">
            {answers[index]?.correct ? "ניחשתם נכון." : "לא הפעם."} אמר/ה:{" "}
            <span className="text-accent">{q.answer.name}</span>
          </div>
          <div className="text-[12px] text-foreground-muted mb-2">
            הפסק שלנו על הציטוט:{" "}
            <span style={{ color: VERDICT_VAR[q.verdict] }}>{VERDICT_LABEL_HE[q.verdict]}</span>
          </div>
          <p className="text-[13px] text-foreground-muted leading-relaxed">{q.summary}</p>
          <div className="flex items-center justify-between mt-3 gap-3 flex-wrap">
            <a
              href={`/claim/${q.id}`}
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
              {index + 1 >= questions.length ? "לתוצאה" : "הבא"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
