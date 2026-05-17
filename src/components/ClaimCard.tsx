"use client";

import { useState } from "react";
import { Claim } from "@/data/mock";
import { VerdictBadge } from "./VerdictBadge";
import { PoliticianAvatar } from "./PoliticianAvatar";
import { ReportButton } from "./ReportButton";
import { CommentsSection } from "./CommentsSection";
import { ShareButtons } from "./ShareButtons";
import { shareTextForClaim } from "@/lib/share-text";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * A URL is "specific" if it points to an actual page (article, document)
 * rather than just a site root.
 */
function isSpecificUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, "");
    if (path.length < 2) return false;
    const segments = path.split("/").filter(Boolean);
    if (segments.length === 0) return false;
    const last = segments[segments.length - 1];
    return last.length >= 4 || segments.length >= 2;
  } catch {
    return false;
  }
}

interface ClaimWithPolitician extends Claim {
  _politician?: {
    id: string;
    name: string;
    party: string;
    image?: string | null;
  };
  _commentCount?: number;
}

const VERIFICATION_SOURCES: { label: string; url: string }[] = [
  { label: "הלמ\"ס", url: "https://www.cbs.gov.il" },
  { label: "בנק ישראל", url: "https://www.boi.org.il" },
  { label: "מבקר המדינה", url: "https://www.mevaker.gov.il" },
  { label: "כנסת ישראל", url: "https://main.knesset.gov.il" },
  { label: "ספר התקציב", url: "https://www.gov.il/he/departments/news/spokesman" },
];

export function ClaimCard({ claim }: { claim: ClaimWithPolitician }) {
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const politician = claim._politician ?? {
    id: claim.politicianId,
    name: claim.politicianId,
    party: "",
    image: null,
  };

  // Prefer the TL;DR if present, otherwise fall back to the first sentence of explanation.
  const tldr =
    claim.summary ||
    claim.explanation.split(/(?<=[.!?])\s+/).slice(0, 1).join(" ");
  const fullExplanationIsLonger = claim.explanation.trim().length > (claim.summary?.length ?? 0) + 20;

  return (
    <article
      className="bg-card border border-border hover:border-border-strong p-5 transition-colors"
      style={{ borderRadius: 4 }}
    >
      <a href={`/politician/${claim.politicianId}`} className="block">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <PoliticianAvatar id={claim.politicianId} name={politician.name} image={politician.image} size="md" />
            <div>
              <div className="font-bold text-sm flex items-center gap-2 flex-wrap">
                {politician.name}
                {claim.editorApproved ? (
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] uppercase tracking-wider font-bold border"
                    style={{
                      borderColor: "var(--verdict-true)",
                      color: "var(--verdict-true)",
                      backgroundColor: "var(--verdict-true-bg)",
                      borderRadius: 2,
                    }}
                    title="עברה בדיקה כפולה: מערכת AI שניה בחנה את פסק הדין, ההסבר והמקור ואישרה אותם"
                  >
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    בדיקה כפולה
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] uppercase tracking-wider font-medium border"
                    style={{
                      borderColor: "var(--border)",
                      color: "var(--foreground-muted)",
                      borderRadius: 2,
                    }}
                    title={
                      claim.verifierNotes
                        ? `הבדיקה השנייה העלתה בעיות: ${claim.verifierNotes}`
                        : "טרם עברה בדיקה כפולה. הטענה פורסמה לאחר בדיקה אחת בלבד."
                    }
                  >
                    טרם אומת
                  </span>
                )}
              </div>
              <div className="text-[11px] text-foreground-muted uppercase tracking-wider mt-0.5">
                {politician.party} <span className="opacity-50 mx-1">·</span> {formatDate(claim.date)}
              </div>
            </div>
          </div>
          <VerdictBadge verdict={claim.verdict} />
        </div>
      </a>

      <blockquote className="text-base md:text-[17px] font-bold mb-3 leading-snug pr-4 border-r-[3px] border-accent">
        &ldquo;{claim.quote}&rdquo;
      </blockquote>

      {/* TL;DR (always visible). Full explanation collapsed by default. */}
      <p className="text-sm text-foreground leading-relaxed">
        <span className="text-[10px] uppercase tracking-wider text-foreground-muted ml-2 font-bold">סיכום:</span>
        {tldr}
      </p>
      {fullExplanationIsLonger && (
        <>
          <button
            onClick={() => setExplanationOpen((v) => !v)}
            className="mt-2 text-[11px] text-accent hover:text-accent-dark font-bold uppercase tracking-wider"
          >
            {explanationOpen ? "סגור הסבר ↑" : "הסבר מלא ↓"}
          </button>
          {explanationOpen && (
            <p className="mt-2 text-sm text-foreground-muted leading-relaxed border-r-2 border-border pr-3">
              {claim.explanation}
            </p>
          )}
        </>
      )}

      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-3 text-xs text-foreground-muted flex-wrap">
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
          <span>
            <span className="uppercase tracking-wider text-[10px] opacity-70">נאמר ב</span>{" "}
            {isSpecificUrl(claim.sourceUrl) ? (
              <a
                href={claim.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:text-accent-dark font-bold underline decoration-1 underline-offset-2"
              >
                {claim.source}
              </a>
            ) : (
              <span className="font-bold text-foreground">{claim.source}</span>
            )}
          </span>
          {claim.factSource && (
            <>
              <span className="opacity-30">·</span>
              <span>
                <span className="uppercase tracking-wider text-[10px] opacity-70">מקור בדיקה</span>{" "}
                <span className="font-bold text-foreground">{claim.factSource}</span>
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <ReportButton claimId={claim.id} />
          <a
            href={`/?topic=${encodeURIComponent(claim.topic)}`}
            className="border border-border hover:border-accent hover:text-accent px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium transition-colors"
            style={{ borderRadius: 2 }}
            title={`סנן לפי נושא: ${claim.topic}`}
          >
            {claim.topic}
          </a>
        </div>
      </div>

      {/* Verification panel — curated trusted sources users can search themselves */}
      <div className="mt-3 pt-3 border-t border-border">
        <button
          onClick={() => setVerifyOpen((v) => !v)}
          className="text-[11px] text-foreground-muted hover:text-accent font-bold uppercase tracking-wider"
        >
          {verifyOpen ? "↑ סגור" : "→ אמת בעצמך"}
        </button>
        {verifyOpen && (
          <div className="mt-2 text-[11px] text-foreground-muted leading-relaxed">
            <p className="mb-2">
              חפש את הטענה ישירות במקורות הרשמיים. אנחנו לא מקשרים ישירות כי קישורים מתיישנים, אבל כלי האימות תקפים תמיד.
            </p>
            <div className="flex flex-wrap gap-2">
              {VERIFICATION_SOURCES.map((s) => (
                <a
                  key={s.url}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-border hover:border-accent hover:text-accent px-2 py-1 transition-colors"
                  style={{ borderRadius: 2 }}
                >
                  {s.label} ↗
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[10px] tracking-wider uppercase text-foreground-muted shrink-0">שתפו</span>
          <ShareButtons
            text={shareTextForClaim(politician.name, claim.verdict, claim.quote)}
            url={typeof window !== "undefined" ? `${window.location.origin}/claim/${claim.id}` : `/claim/${claim.id}`}
          />
        </div>
        <a
          href={`/claim/${claim.id}`}
          className="text-[11px] text-foreground-muted hover:text-accent font-bold tracking-wider uppercase"
        >
          {claim._commentCount !== undefined && claim._commentCount > 0
            ? `${claim._commentCount} תגובות · קישור ↗`
            : "קישור לטענה ↗"}
        </a>
      </div>
      <CommentsSection claimId={claim.id} initialCount={claim._commentCount ?? 0} />
    </article>
  );
}
