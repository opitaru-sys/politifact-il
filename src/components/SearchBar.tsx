"use client";

import { useState, useRef, useEffect } from "react";
import { PoliticianAvatar } from "./PoliticianAvatar";

interface SearchPolitician {
  id: string;
  name: string;
  party: string;
  image: string | null;
}

/**
 * `compact` strips the surrounding card + eyebrow label and renders just
 * a slim single-line input. Used on the home page after a homepage
 * refactor cut the dedicated "חפשו פוליטיקאי" card — search is still
 * easy to find but doesn't claim a whole section's worth of real estate.
 */
export function SearchBar({
  politicians,
  compact = false,
}: {
  politicians: SearchPolitician[];
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const q = query.trim();
  const filtered =
    q.length > 0
      ? politicians
          .filter((p) => p.name.includes(q) || p.party.includes(q))
          .slice(0, 8)
      : [];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const showDropdown = focused && q.length > 0;

  return (
    <div className="relative" ref={containerRef}>
      {compact ? (
        <input
          id="politician-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="חפשו פוליטיקאי או מפלגה..."
          className="w-full px-4 py-2.5 bg-card border-[1.5px] border-border-strong text-sm focus:border-accent focus:outline-none transition-colors placeholder:text-foreground-muted/70"
          style={{ borderRadius: 4 }}
        />
      ) : (
        <div
          className="bg-card border border-border-strong px-5 py-4"
          style={{ borderRadius: 4 }}
        >
          <label
            htmlFor="politician-search"
            className="block text-[10px] tracking-[0.25em] uppercase font-bold text-foreground-muted mb-2"
          >
            חיפוש · פוליטיקאי או מפלגה
          </label>
          <input
            id="politician-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            placeholder="הקלד שם פוליטיקאי או מפלגה"
            className="w-full px-0 py-1.5 bg-transparent border-0 border-b-2 border-border focus:border-accent text-base focus:outline-none transition-colors placeholder:text-foreground-muted/60"
          />
        </div>
      )}
      {showDropdown && filtered.length > 0 && (
        <div
          className="absolute top-full left-0 right-0 mt-1 bg-card border border-border-strong z-10 overflow-hidden shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
          style={{ borderRadius: 4 }}
        >
          {filtered.map((p) => (
            <a
              key={p.id}
              href={`/politician/${p.id}`}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors border-b border-border last:border-b-0"
            >
              <PoliticianAvatar id={p.id} name={p.name} image={p.image} size="sm" />
              <div className="min-w-0">
                <div className="font-bold text-sm">{p.name}</div>
                <div className="text-[11px] text-foreground-muted">{p.party}</div>
              </div>
            </a>
          ))}
        </div>
      )}
      {showDropdown && filtered.length === 0 && (
        <div
          className="absolute top-full left-0 right-0 mt-1 bg-card border border-border-strong z-10 px-5 py-3 text-sm text-foreground-muted"
          style={{ borderRadius: 4 }}
        >
          לא נמצאו תוצאות
        </div>
      )}
    </div>
  );
}
