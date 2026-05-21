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

export function ClaimCard({ claim }: { claim: ClaimWithPolitician }) {
  const [explanationOpen, setExplanationOpen] = useState(false);
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
      {/* Header: avatar + politician + date/party | verdict.
          Note: we used to render a "בדיקה כפולה" / "טרם אומת" badge here.
          Removed because the public feed only shows claims with
          editorApproved=true (see queries.ts PUBLIC_CLAIM_FILTER), so
          the badge was redundant noise on every card. The double-check
          info is still visible on the admin claims editor. */}
      <a href={`/politician/${claim.politicianId}`} className="block">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <PoliticianAvatar id={claim.politicianId} name={politician.name} image={politician.image} size="md" />
            <div>
              <div className="font-bold text-sm">{politician.name}</div>
              <div className="text-[11px] text-foreground-muted mt-0.5">
                {politician.party}
                {politician.party && " · "}
                {formatDate(claim.date)}
              </div>
            </div>
          </div>
          <VerdictBadge verdict={claim.verdict} />
        </div>
      </a>

      <blockquote className="text-base md:text-[17px] font-bold mb-3 leading-snug pr-4 border-r-[3px] border-accent">
        &ldquo;{claim.quote}&rdquo;
      </blockquote>

      {/* TL;DR + optional full-explanation toggle */}
      <p className="text-sm text-foreground leading-relaxed">{tldr}</p>
      {fullExplanationIsLonger && (
        <>
          <button
            onClick={() => setExplanationOpen((v) => !v)}
            className="mt-2 text-[11px] text-foreground-muted hover:text-accent font-medium"
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

      {/* One compact footer row — meta on the right, actions on the left.
          Previously this was 3 separate bordered zones (meta / verify-
          yourself / share+comments). The verify-yourself panel and its
          5 verification chips moved to the claim detail page; on the
          home feed they were noise.  */}
      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-3 text-[11px] text-foreground-muted flex-wrap">
        <div className="flex items-center gap-x-2 gap-y-1 flex-wrap min-w-0">
          <span className="truncate">
            {isSpecificUrl(claim.sourceUrl) ? (
              <a
                href={claim.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent font-medium"
              >
                {claim.source}
              </a>
            ) : (
              <span className="font-medium">{claim.source}</span>
            )}
          </span>
          {claim.factSource && (
            <>
              <span className="opacity-30">·</span>
              <span className="truncate">{claim.factSource}</span>
            </>
          )}
          <a
            href={`/?topic=${encodeURIComponent(claim.topic)}`}
            className="text-foreground-muted hover:text-accent font-medium"
            title={`סנן לפי נושא: ${claim.topic}`}
          >
            · {claim.topic}
          </a>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ShareButtons
            text={shareTextForClaim(politician.name, claim.verdict, claim.quote)}
            url={typeof window !== "undefined" ? `${window.location.origin}/claim/${claim.id}` : `/claim/${claim.id}`}
          />
          <ReportButton claimId={claim.id} />
          <a
            href={`/claim/${claim.id}`}
            className="text-foreground-muted hover:text-accent font-medium"
            title="עמוד הטענה"
          >
            {claim._commentCount !== undefined && claim._commentCount > 0
              ? `↗ ${claim._commentCount}`
              : "↗"}
          </a>
        </div>
      </div>
      <CommentsSection claimId={claim.id} initialCount={claim._commentCount ?? 0} />
    </article>
  );
}
