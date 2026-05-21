"use client";

import { useEffect, useState } from "react";

const REASONS = [
  "הטענה לא נאמרה על ידי הפוליטיקאי",
  "פסק הדין שגוי, הטענה למעשה נכונה",
  "פסק הדין שגוי, הטענה למעשה שגויה",
  "ההסבר חסר הקשר חשוב",
  "המקור לא תומך בטענה",
  "אחר",
];

interface ReportButtonProps {
  claimId: string;
  /**
   * `inline` (default): small text-link trigger that opens a popover.
   *   Used on feed cards where space is tight.
   * `prominent`: bordered button trigger that opens the same form.
   *   Used on claim detail page where the report CTA is a primary action.
   */
  variant?: "inline" | "prominent";
}

export function ReportButton({ claimId, variant = "inline" }: ReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  // Lock body scroll while the mobile sheet is open. The sheet is a
  // full-overlay element on small screens, so background scroll would feel
  // broken; on desktop the popover is positioned and scroll lock doesn't
  // apply (we only lock when the sheet is mounted as the layout used).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ESC closes the sheet/popover.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function submit() {
    if (!reason) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId, reason, details }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <span
        className="text-xs font-medium px-2 py-1 inline-flex items-center gap-1"
        style={{
          color: "var(--verdict-true)",
          backgroundColor: "var(--verdict-true-bg)",
          borderRadius: 2,
        }}
        title="הדיווח נשמר ויעבור בדיקה ידנית"
      >
        ✓ תודה, הדיווח התקבל
      </span>
    );
  }

  const triggerClass =
    variant === "prominent"
      ? "border-[1.5px] border-accent text-accent hover:bg-accent hover:text-white px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors w-full text-center"
      : "text-[11px] text-foreground-muted hover:text-accent underline decoration-1 underline-offset-2";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClass}
        style={{ borderRadius: 2 }}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        דיווח על שגיאה
      </button>

      {open && (
        <>
          {/* Backdrop. Captures clicks outside the form to dismiss. */}
          <div
            className="fixed inset-0 z-40 bg-foreground/30"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Form. On mobile it's a bottom sheet pinned to the bottom of
              the viewport with rounded top corners. On md+ it's a centered
              modal. Both layouts use the same DOM, just different CSS via
              the responsive utility classes. */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="דיווח על שגיאה בטענה"
            className="
              fixed z-50 bg-background border-[1.5px] border-border-strong shadow-2xl
              flex flex-col
              inset-x-0 bottom-0 max-h-[88vh]
              md:inset-x-auto md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2
              md:w-[28rem] md:max-h-[80vh]
            "
            style={{ borderRadius: 4 }}
          >
            <header className="px-5 py-3.5 border-b border-border-strong flex items-center justify-between">
              <div>
                <div className="text-[10px] tracking-[0.25em] uppercase text-accent font-bold">
                  דיווח על שגיאה
                </div>
                <div className="text-sm font-bold mt-0.5">מה הבעיה עם הטענה?</div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-foreground-muted hover:text-foreground text-lg leading-none w-7 h-7 flex items-center justify-center"
                aria-label="סגור"
              >
                ×
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <fieldset className="space-y-2 mb-4">
                <legend className="sr-only">סיבת הדיווח</legend>
                {REASONS.map((r) => (
                  <label
                    key={r}
                    className={`flex items-start gap-2.5 text-sm cursor-pointer p-2 border transition-colors ${
                      reason === r ? "bg-card border-accent" : "border-transparent hover:bg-card"
                    }`}
                    style={{ borderRadius: 2 }}
                  >
                    <input
                      type="radio"
                      name={`reason-${claimId}`}
                      value={r}
                      checked={reason === r}
                      onChange={() => setReason(r)}
                      className="mt-0.5 accent-[var(--accent)]"
                    />
                    <span>{r}</span>
                  </label>
                ))}
              </fieldset>

              <label className="block">
                <span className="block text-[10px] tracking-[0.2em] uppercase text-foreground-muted font-bold mb-1.5">
                  פירוט נוסף (אופציונלי)
                </span>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="ציטוט מדויק, קישור למקור הנכון, הקשר חסר..."
                  className="w-full text-sm border border-border bg-card px-3 py-2 resize-none h-20 focus:outline-none focus:border-foreground-muted"
                  style={{ borderRadius: 2 }}
                  dir="rtl"
                  maxLength={500}
                />
              </label>

              {status === "error" && (
                <p
                  className="text-xs mt-2 px-2 py-1.5"
                  style={{
                    color: "var(--verdict-false)",
                    backgroundColor: "var(--verdict-false-bg)",
                    borderRadius: 2,
                  }}
                >
                  שגיאה בשליחה. נסו שוב או פנו ב-LinkedIn.
                </p>
              )}
            </div>

            <footer className="px-5 py-3 border-t border-border-strong flex items-center justify-between gap-3 bg-card">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-foreground-muted hover:text-foreground font-bold uppercase tracking-wider"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!reason || status === "loading"}
                className="text-xs bg-accent text-white py-2 px-5 font-bold uppercase tracking-wider hover:bg-accent-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                style={{ borderRadius: 2 }}
              >
                {status === "loading" ? "שולח..." : "שלח דיווח"}
              </button>
            </footer>
          </div>
        </>
      )}
    </>
  );
}
