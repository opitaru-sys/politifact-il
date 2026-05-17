"use client";

import { useState } from "react";

const REASONS = [
  "הטענה לא נאמרה על ידי הפוליטיקאי",
  "פסק הדין שגוי — הטענה נכונה",
  "פסק הדין שגוי — הטענה שגויה",
  "ההסבר חסר הקשר חשוב",
  "המקור לא תומך בטענה",
  "אחר",
];

export function ReportButton({ claimId }: { claimId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function submit() {
    if (!reason) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId, reason, details }),
      });
      if (res.ok) {
        setStatus("done");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <span className="text-xs text-green-600 font-medium" title="הדיווח נשמר ויעבור בדיקה ידנית">
        תודה — הדיווח יעבור בדיקה ✓
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-gray-400 hover:text-gray-600 transition-colors underline"
      >
        דיווח על שגיאה
      </button>

      {open && (
        <div className="absolute bottom-6 left-0 z-10 bg-white border border-border rounded-xl shadow-lg p-4 w-72">
          <p className="text-sm font-bold mb-2">מה הבעיה עם הטענה?</p>
          <div className="space-y-1 mb-3">
            {REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name={`reason-${claimId}`}
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="accent-red-500"
                />
                {r}
              </label>
            ))}
          </div>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="פרטים נוספים (אופציונלי)"
            className="w-full text-xs border border-border rounded-lg p-2 resize-none h-16 mb-2"
            dir="rtl"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setOpen(false)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              ביטול
            </button>
            <button
              onClick={submit}
              disabled={!reason || status === "loading"}
              className="text-xs bg-red-500 text-white px-3 py-1 rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {status === "loading" ? "שולח..." : "שלח דיווח"}
            </button>
          </div>
          {status === "error" && (
            <p className="text-xs text-red-500 mt-1">שגיאה בשליחה, נסה שוב</p>
          )}
        </div>
      )}
    </div>
  );
}
