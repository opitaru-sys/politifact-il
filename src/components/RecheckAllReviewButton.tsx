"use client";

/**
 * Drains the human-review queue by calling /api/admin/review/recheck-batch
 * repeatedly until every claim has been re-checked once this run. Each batch
 * is a server round-trip of a few grounded checks (~30-60s), so the whole
 * drain of ~70 claims takes several minutes — we show live progress and keep
 * going automatically. Keep the tab open; navigating away stops it (re-runnable).
 *
 * Cost: each claim is a grounded fact-check (~$0.05), so a full drain is ~$3-4.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Tally {
  processed: number;
  corrected: number;
  confirmed: number;
  withheld: number;
  failed: number;
  remaining: number;
}

const ZERO: Tally = {
  processed: 0,
  corrected: 0,
  confirmed: 0,
  withheld: 0,
  failed: 0,
  remaining: 0,
};

export function RecheckAllReviewButton({ total }: { total: number }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "done" | "error">(
    "idle",
  );
  const [tally, setTally] = useState<Tally>({ ...ZERO, remaining: total });
  const [errorMsg, setErrorMsg] = useState("");

  async function run() {
    setState("running");
    setErrorMsg("");
    const before = new Date().toISOString();
    const acc: Tally = { ...ZERO, remaining: total };
    try {
      // Safety cap so a bug can't loop forever. 60 batches × 6 = 360 claims.
      for (let i = 0; i < 60; i++) {
        const resp = await fetch("/api/admin/review/recheck-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ before }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data?.error ?? `שגיאה (${resp.status})`);
        acc.processed += data.processed ?? 0;
        acc.corrected += data.corrected ?? 0;
        acc.confirmed += data.confirmed ?? 0;
        acc.withheld += data.withheld ?? 0;
        acc.failed += data.failed ?? 0;
        acc.remaining = data.remaining ?? 0;
        setTally({ ...acc });
        if (!data.processed || data.remaining === 0) break;
      }
      setState("done");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[RecheckAllReviewButton] failed:", message);
      setErrorMsg(message);
      setState("error");
    }
  }

  const published = tally.corrected + tally.confirmed;

  if (state === "running" || state === "done") {
    return (
      <div className="text-[12px] leading-relaxed">
        <div className="font-bold text-foreground">
          {state === "running"
            ? `בודק מחדש… ${tally.processed}/${total}`
            : `סיום. נבדקו ${tally.processed} טענות.`}
        </div>
        <div className="text-foreground-muted">
          פורסמו {published} (מתוקנות {tally.corrected}) · נותרו לבדיקה אנושית{" "}
          {tally.withheld}
          {tally.failed > 0 ? ` · נכשלו ${tally.failed}` : ""}
          {state === "running" ? ` · בתור: ${tally.remaining}` : ""}
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div>
        <div className="text-[11px] text-red-600 mb-2">
          הריצה נעצרה: {errorMsg}. מה שכבר נבדק נשמר.
        </div>
        <button
          type="button"
          onClick={run}
          className="text-[11px] font-bold uppercase tracking-wider border border-border hover:border-accent hover:text-accent py-1.5 px-3 cursor-pointer"
          style={{ borderRadius: 2 }}
        >
          המשך מהמקום שנעצר
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={run}
      className="text-[12px] font-bold uppercase tracking-wider bg-green-700 text-white py-2 px-4 hover:opacity-90 cursor-pointer"
      style={{ borderRadius: 2 }}
      title={`מריץ בדיקה חוזרת עם חיפוש על כל ${total} הטענות בתור. עולה בערך $${(total * 0.05).toFixed(0)}. השאר את הטאב פתוח.`}
    >
      בדוק מחדש את כל התור ({total}) · ~${(total * 0.05).toFixed(0)}
    </button>
  );
}
