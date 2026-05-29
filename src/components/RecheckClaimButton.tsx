"use client";

/**
 * Runs a grounded re-check on a claim via /api/admin/recheck. Unlike the
 * LITE report recommendation (which only rewords without searching), this
 * runs a real grounded fact-check and then corrects, confirms, or withholds
 * the claim for human review.
 *
 * The call is slow (~20-30s of grounded search), so the loading state is
 * explicit. After it resolves we refresh so the parent list updates — a
 * resolved report or a verified review-claim drops out of its queue.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  claimId: string;
  /** When present, the resolved report is deleted from the queue. */
  reportId?: string;
}

type Outcome = "corrected" | "confirmed" | "withheld";

const OUTCOME_MSG: Record<Outcome, { text: string; cls: string }> = {
  corrected: {
    text: "✓ תוקן — הפסק עודכן לפי בדיקה חוזרת עם מקורות ופורסם",
    cls: "text-green-700",
  },
  confirmed: {
    text: "✓ אומת — הפסק הנוכחי נכון, פורסם",
    cls: "text-green-700",
  },
  withheld: {
    text: "לא ניתן לאמת אוטומטית. הטענה הועברה לבדיקה אנושית.",
    cls: "text-amber-700",
  },
};

export function RecheckClaimButton({ claimId, reportId }: Props) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "checking" | "done" | "error">(
    "idle",
  );
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  async function onClick() {
    setState("checking");
    setErrorMsg("");
    try {
      const resp = await fetch("/api/admin/recheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId, reportId }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error ?? `שגיאה (${resp.status})`);
      setOutcome(data.outcome as Outcome);
      setState("done");
      // Refresh so the parent queue reflects the new state.
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[RecheckClaimButton] failed:", message);
      setErrorMsg(message);
      setState("error");
    }
  }

  if (state === "done" && outcome) {
    const m = OUTCOME_MSG[outcome];
    return <div className={`mt-3 text-[12px] font-bold ${m.cls}`}>{m.text}</div>;
  }

  if (state === "error") {
    return (
      <div className="mt-3">
        <div className="text-[11px] text-red-600 mb-2">
          בדיקה חוזרת נכשלה: {errorMsg}
        </div>
        <button
          type="button"
          onClick={() => setState("idle")}
          className="text-[11px] font-bold uppercase tracking-wider border border-border hover:border-accent hover:text-accent py-1.5 px-3 cursor-pointer"
          style={{ borderRadius: 2 }}
        >
          נסה שוב
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === "checking"}
      className="text-[11px] font-bold uppercase tracking-wider bg-green-700 text-white py-1.5 px-3 hover:opacity-90 disabled:opacity-60 disabled:cursor-wait cursor-pointer"
      style={{ borderRadius: 2 }}
      title="מריץ בדיקת עובדות אמיתית עם חיפוש מקורות, ומתקן / מאמת / מעביר לבדיקה אנושית"
    >
      {state === "checking"
        ? "בודק מחדש… (עד 30 שניות)"
        : "בדוק מחדש עם חיפוש מקורות"}
    </button>
  );
}
