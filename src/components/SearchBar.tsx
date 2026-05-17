"use client";

import { useState } from "react";
import { PoliticianAvatar } from "./PoliticianAvatar";

interface SearchPolitician {
  id: string;
  name: string;
  party: string;
  image: string | null;
}

export function SearchBar({ politicians }: { politicians: SearchPolitician[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim();
  const filtered =
    q.length > 0
      ? politicians
          .filter((p) => p.name.includes(q) || p.party.includes(q))
          .slice(0, 8)
      : [];

  return (
    <div className="relative">
      <div className="bg-white rounded-xl border border-border p-4">
        <label className="block text-sm font-bold mb-2">🔍 חיפוש פוליטיקאי או מפלגה</label>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="הקלד שם פוליטיקאי או מפלגה..."
          className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
        />
      </div>
      {filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg z-10 overflow-hidden">
          {filtered.map((p) => (
            <a
              key={p.id}
              href={`/politician/${p.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <PoliticianAvatar id={p.id} name={p.name} image={p.image} size="sm" />
              <div>
                <div className="font-medium text-sm">{p.name}</div>
                <div className="text-xs text-gray-500">{p.party}</div>
              </div>
            </a>
          ))}
        </div>
      )}
      {q.length > 0 && filtered.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg z-10 px-4 py-3 text-sm text-gray-500">
          לא נמצאו תוצאות
        </div>
      )}
    </div>
  );
}
