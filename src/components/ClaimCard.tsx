import { Claim } from "@/data/mock";
import { VerdictBadge } from "./VerdictBadge";
import { PoliticianAvatar } from "./PoliticianAvatar";
import { ReportButton } from "./ReportButton";
import { CommentsSection } from "./CommentsSection";
import { ShareButtons } from "./ShareButtons";
import { shareTextForClaim } from "@/lib/share-text";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
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
  const politician = claim._politician ?? {
    id: claim.politicianId,
    name: claim.politicianId,
    party: "",
    image: null,
  };

  return (
    <div className="bg-white rounded-xl border border-border p-4 hover:shadow-md transition-shadow">
      <a href={`/politician/${claim.politicianId}`}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <PoliticianAvatar id={claim.politicianId} name={politician.name} image={politician.image} size="md" />
            <div>
              <div className="font-bold text-sm">{politician.name}</div>
              <div className="text-xs text-gray-500">{politician.party} • {formatDate(claim.date)}</div>
            </div>
          </div>
          <VerdictBadge verdict={claim.verdict} />
        </div>
      </a>
      <blockquote className="text-base font-medium mb-3 leading-relaxed border-r-4 border-gray-200 pr-3">
        &ldquo;{claim.quote}&rdquo;
      </blockquote>
      <p className="text-sm text-gray-600 leading-relaxed">{claim.explanation}</p>
      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-2 flex-wrap">
          <span>
            נאמר ב:{" "}
            <a
              href={claim.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline font-medium"
            >
              {claim.source} ↗
            </a>
          </span>
          {claim.factSource && (
            <>
              <span>•</span>
              {claim.factSourceUrl ? (
                <a
                  href={claim.factSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline font-medium"
                >
                  מקור בדיקה: {claim.factSource} ↗
                </a>
              ) : (
                <span className="text-gray-500">מקור בדיקה: {claim.factSource}</span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <ReportButton claimId={claim.id} />
          <span className="bg-gray-100 px-2 py-0.5 rounded">{claim.topic}</span>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
        <span className="text-xs text-gray-400 shrink-0">שתפו:</span>
        <ShareButtons text={shareTextForClaim(politician.name, claim.verdict, claim.quote)} />
      </div>
      <CommentsSection claimId={claim.id} initialCount={claim._commentCount ?? 0} />
    </div>
  );
}
