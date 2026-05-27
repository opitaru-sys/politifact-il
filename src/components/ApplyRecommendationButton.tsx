"use client";

/**
 * Client-side button that POSTs the AI recommendation to
 * /api/admin/reports/apply, then refreshes the page so the resolved
 * report disappears from the queue.
 *
 * We picked a route handler over a server action specifically because
 * server actions on this page were silently failing — likely a Next 16
 * edge case with the `name="action"` hidden input colliding with the
 * <form action={...}> prop. A plain fetch is more reliable here.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReportAction } from "@/lib/report-recommendation";

interface Props {
  reportId: string;
  claimId: string;
  action: ReportAction;
  newVerdict?: "true" | "half-true" | "false";
  newExplanation?: string;
  correctionNote: string;
}

export function ApplyRecommendationButton(props: Props) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "applying" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function onClick() {
    setState("applying");
    setErrorMsg("");
    try {
      const resp = await fetch("/api/admin/reports/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(props),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data?.error ?? `שגיאה (${resp.status})`);
      }
      // Refresh so the resolved report disappears from the list.
      router.refresh();
      setState("idle");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[ApplyRecommendationButton] failed:", message);
      setErrorMsg(message);
      setState("error");
    }
  }

  if (state === "error") {
    return (
      <div className="mt-3">
        <div className="text-[11px] text-red-600 mb-2">שגיאה בהחלת ההמלצה: {errorMsg}</div>
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
      disabled={state === "applying"}
      className="mt-3 text-[11px] font-bold uppercase tracking-wider bg-green-700 text-white py-1.5 px-3 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      style={{ borderRadius: 2 }}
      title="החל את ההמלצה (משנה את הטענה + סוגר את הדיווח)"
    >
      {state === "applying" ? "מחיל…" : "✓ החל המלצה"}
    </button>
  );
}
