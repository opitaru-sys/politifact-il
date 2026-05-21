"use client";

import { useEffect, useState } from "react";

interface Comment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

function timeAgoHebrew(dateStr: string): string {
  const date = new Date(dateStr);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "לפני כמה שניות";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `לפני ${minutes} דק'`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `לפני ${days} ימים`;
  return date.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });
}

export function CommentsSection({
  claimId,
  initialCount = 0,
}: {
  claimId: string;
  initialCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const displayCount = loaded ? comments.length : initialCount;
  const [author, setAuthor] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lazy-load comments only when expanded
  useEffect(() => {
    if (open && !loaded) {
      fetch(`/api/comment?claimId=${encodeURIComponent(claimId)}`)
        .then((r) => r.json())
        .then((data) => {
          setComments(data.comments || []);
          setLoaded(true);
        })
        .catch(() => setLoaded(true));
    }
  }, [open, loaded, claimId]);

  async function submit() {
    if (body.trim().length < 2) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId, author, body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "שגיאה");
      } else {
        setComments([data.comment, ...comments]);
        setBody("");
      }
    } catch {
      setError("שגיאת רשת");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="text-[11px] tracking-[0.2em] uppercase text-foreground-muted hover:text-foreground font-bold transition-colors"
      >
        {open ? "סגור דיון ↑" : `דיון${displayCount > 0 ? ` · ${displayCount}` : ""} ↓`}
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {/* Compose */}
          <div
            className="bg-card border border-border p-4"
            style={{ borderRadius: 4 }}
          >
            <label className="block mb-2">
              <span className="block text-[10px] tracking-[0.2em] uppercase text-foreground-muted font-bold mb-1">
                שם (אופציונלי)
              </span>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="אנונימי"
                maxLength={60}
                className="w-full text-sm px-2.5 py-1.5 border border-border bg-background focus:outline-none focus:border-foreground-muted"
                style={{ borderRadius: 2 }}
                dir="rtl"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] tracking-[0.2em] uppercase text-foreground-muted font-bold mb-1">
                תגובה
              </span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="הוסיפו הקשר, תקנו, או הצביעו על מקור"
                maxLength={1000}
                className="w-full text-sm px-2.5 py-1.5 border border-border resize-none h-20 bg-background focus:outline-none focus:border-foreground-muted"
                style={{ borderRadius: 2 }}
                dir="rtl"
              />
            </label>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] text-foreground-muted tabular-nums">
                {body.length}/1000
              </span>
              <button
                onClick={submit}
                disabled={submitting || body.trim().length < 2}
                className="text-xs bg-foreground text-background px-4 py-1.5 font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed hover:bg-foreground-muted transition-colors"
                style={{ borderRadius: 2 }}
              >
                {submitting ? "שולח..." : "פרסם"}
              </button>
            </div>
            {error && (
              <p
                className="text-xs mt-2 px-2 py-1"
                style={{
                  color: "var(--verdict-false)",
                  backgroundColor: "var(--verdict-false-bg)",
                  borderRadius: 2,
                }}
              >
                {error}
              </p>
            )}
          </div>

          {/* List */}
          {!loaded && (
            <div className="text-xs text-foreground-muted italic">טוען תגובות...</div>
          )}
          {loaded && comments.length === 0 && (
            <div className="text-xs text-foreground-muted italic">
              אין תגובות עדיין. היו הראשונים להוסיף הקשר.
            </div>
          )}
          {comments.map((c) => (
            <div
              key={c.id}
              className="border-r-2 border-border pr-3 py-2"
            >
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-xs font-bold">{c.author || "אנונימי"}</span>
                <span className="text-[10px] text-foreground-muted tabular-nums">
                  {timeAgoHebrew(c.createdAt)}
                </span>
              </div>
              <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                {c.body}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
