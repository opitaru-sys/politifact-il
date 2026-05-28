"use client";

/**
 * Manual drain button for /admin/status. POSTs to /api/admin/drain
 * which processes up to 100 fresh-lane articles (or up to 30 Knesset
 * articles via mode=knesset). Used when the queue has piled up between
 * cron ticks.
 *
 * The drain can take minutes for a full batch. Button disables itself
 * while a request is in flight and shows the result inline so the
 * admin doesn't double-click.
 *
 * UX: each button shows its lane's queue depth ("(N)") so the admin
 * knows which one has work. The lane with the larger queue is the
 * highlighted (accent) button. Lanes with 0 queue are disabled — this
 * stops the "I clicked it and nothing happened" failure mode where the
 * admin clicked the prominent button while all the stuck articles were
 * in the other lane.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

type DrainMode = "fresh" | "knesset";

interface Props {
  freshCount: number;
  knessetCount: number;
}

export function DrainQueueButton({ freshCount, knessetCount }: Props) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "draining" | "done" | "error">("idle");
  const [result, setResult] = useState<string>("");

  async function drain(mode: DrainMode) {
    setState("draining");
    setResult("");
    try {
      const resp = await fetch(`/api/admin/drain?mode=${mode}`, {
        method: "POST",
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data?.error ?? `שגיאה (${resp.status})`);
      }
      setResult(`הופקו ${data.processed} טענות`);
      setState("done");
      router.refresh();
    } catch (err) {
      setResult(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  }

  const total = freshCount + knessetCount;
  if (total === 0 && state === "idle") {
    return <span className="text-[11px] text-foreground-muted">תור ריק</span>;
  }

  // The lane with the larger queue is the prominent (accent) button.
  // If they're tied, fresh wins (it's the more expensive lane to leave
  // sitting — grounded fact-check articles age fastest).
  const freshIsPrimary = freshCount >= knessetCount;

  const primaryClass =
    "text-[11px] font-bold uppercase tracking-wider bg-accent text-white py-1.5 px-3 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer";
  const secondaryClass =
    "text-[11px] font-bold uppercase tracking-wider border border-border hover:border-accent hover:text-accent py-1.5 px-3 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer";

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => drain("fresh")}
          disabled={state === "draining" || freshCount === 0}
          className={freshIsPrimary ? primaryClass : secondaryClass}
          style={{ borderRadius: 2 }}
          title={
            freshCount === 0
              ? "אין כתבות חדשות בתור"
              : `עבד עד 100 כתבות מהתור (RSS + טלגרם, עם חיפוש חי) · ${freshCount} ממתינות`
          }
        >
          {state === "draining" ? "מעבד…" : `חדשות (${freshCount})`}
        </button>
        <button
          type="button"
          onClick={() => drain("knesset")}
          disabled={state === "draining" || knessetCount === 0}
          className={freshIsPrimary ? secondaryClass : primaryClass}
          style={{ borderRadius: 2 }}
          title={
            knessetCount === 0
              ? "אין כתבות כנסת בתור"
              : `עבד עד 30 כתבות כנסת (ללא חיפוש חי, זול) · ${knessetCount} ממתינות`
          }
        >
          {state === "draining" ? "מעבד…" : `כנסת (${knessetCount})`}
        </button>
      </div>
      {result && (
        <div
          className={`text-[11px] ${state === "error" ? "text-press-red" : "text-foreground-muted"}`}
        >
          {result}
        </div>
      )}
    </div>
  );
}
