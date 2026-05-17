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
    <div className="mt-3 pt-3 border-t border-gray-100">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1"
      >
        💬 {open ? "סגור תגובות" : `תגובות${displayCount > 0 ? ` (${displayCount})` : ""}`}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Compose */}
          <div className="bg-gray-50 rounded-lg p-3">
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="שם (אופציונלי)"
              maxLength={60}
              className="w-full text-sm px-3 py-1.5 border border-gray-200 rounded mb-2 bg-white"
              dir="rtl"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="הוסיפו תגובה. שתפו הקשר, תקנו, או הוסיפו מקור"
              maxLength={1000}
              className="w-full text-sm px-3 py-1.5 border border-gray-200 rounded resize-none h-16 bg-white"
              dir="rtl"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-400">{body.length}/1000</span>
              <button
                onClick={submit}
                disabled={submitting || body.trim().length < 2}
                className="text-xs bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? "שולח..." : "פרסם"}
              </button>
            </div>
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
          </div>

          {/* List */}
          {!loaded && <div className="text-xs text-gray-400">טוען...</div>}
          {loaded && comments.length === 0 && (
            <div className="text-xs text-gray-400 italic">אין תגובות עדיין. היו הראשונים</div>
          )}
          {comments.map((c) => (
            <div key={c.id} className="bg-white border border-gray-100 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-gray-700">{c.author}</span>
                <span className="text-xs text-gray-400">{timeAgoHebrew(c.createdAt)}</span>
              </div>
              <div className="text-sm text-gray-800 whitespace-pre-wrap">{c.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
