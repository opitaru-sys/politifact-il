"use client";

/**
 * One-click bulk dismiss for the low-confidence tail of the human-review
 * queue (/admin/review). Dismisses every withheld claim at or below the
 * confidence threshold (default 30%) via the bulkDismissLowConfidenceReview
 * server action.
 *
 * Guards the action behind a confirm() dialog showing the exact count,
 * because it's a bulk state change. It's reversible from the full editor,
 * but a misclick shouldn't silently clear the queue.
 *
 * Renders nothing when count is 0 so the button only appears when there's
 * actually something to dismiss.
 */
import { useState } from "react";
import { bulkDismissLowConfidenceReview } from "@/app/admin/_actions";

interface Props {
  count: number;
  thresholdPct: number;
}

export function BulkDismissLowConfidenceButton({ count, thresholdPct }: Props) {
  const [submitting, setSubmitting] = useState(false);

  if (count === 0) return null;

  return (
    <form
      action={bulkDismissLowConfidenceReview}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `לדחות אוטומטית ${count} טענות בביטחון ${thresholdPct}% ומטה?\n\n` +
              `הן יוסרו מהתור (סטטוס "נדחה"). ניתן לשחזר בעריכה המלאה.`,
          )
        ) {
          e.preventDefault();
          return;
        }
        setSubmitting(true);
      }}
    >
      <button
        type="submit"
        disabled={submitting}
        className="text-[12px] font-bold uppercase tracking-wider border border-red-300 text-red-700 hover:bg-red-50 py-2 px-4 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ borderRadius: 2 }}
        title={`דוחה את כל ${count} הטענות בתור שהביטחון האוטומטי שלהן ${thresholdPct}% ומטה. הפעולה הפיכה דרך העריכה המלאה.`}
      >
        {submitting ? "דוחה…" : `דחה ביטחון נמוך ≤${thresholdPct}% (${count})`}
      </button>
    </form>
  );
}
