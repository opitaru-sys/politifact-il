"use client";

/**
 * Manual drain button for /admin/status. POSTs to /api/admin/drain
 * which processes up to 100 fresh-lane articles (or all lanes via the
 * "all" mode). Used when the queue has piled up between cron ticks.
 *
 * The drain can take minutes for a full 100-article batch. Button
 * disables itself while a request is in flight and shows the result
 * inline so the admin doesn't double-click.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

type DrainMode = "fresh" | "knesset" | "all";

interface Props {
  queueDepth: number;
}

export function DrainQueueButton({ queueDepth }: Props) {
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
      const summary =
        mode === "all"
          ? `הופקו ${data.processed} טענות (${data.fresh} חדשות, ${data.knesset} כנסת)`
          : `הופקו ${data.processed} טענות`;
      setResult(summary);
      setState("done");
      router.refresh();
    } catch (err) {
      setResult(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  }

  if (queueDepth === 0 && state === "idle") {
    return <span className="text-[11px] text-foreground-muted">תור ריק</span>;
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => drain("fresh")}
          disabled={state === "draining"}
          className="text-[11px] font-bold uppercase tracking-wider bg-accent text-white py-1.5 px-3 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          style={{ borderRadius: 2 }}
          title="עבד עד 100 כתבות מהתור (RSS + טלגרם, עם חיפוש חי)"
        >
          {state === "draining" ? "מעבד…" : "נקה תור חדשות"}
        </button>
        <button
          type="button"
          onClick={() => drain("knesset")}
          disabled={state === "draining"}
          className="text-[11px] font-bold uppercase tracking-wider border border-border hover:border-accent hover:text-accent py-1.5 px-3 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          style={{ borderRadius: 2 }}
          title="עבד עד 30 כתבות כנסת (ללא חיפוש חי, זול)"
        >
          כנסת
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
