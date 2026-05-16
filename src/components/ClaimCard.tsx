import { Claim, getPolitician } from "@/data/mock";
import { VerdictBadge } from "./VerdictBadge";
import { PoliticianAvatar } from "./PoliticianAvatar";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
}

export function ClaimCard({ claim }: { claim: Claim }) {
  const politician = getPolitician(claim.politicianId);
  if (!politician) return null;

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
      <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
        <div className="flex items-center gap-2">
          <span>נאמר ב: {claim.source}</span>
          {claim.factSource && (
            <>
              <span>•</span>
              <a
                href={claim.factSourceUrl ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline font-medium"
              >
                {claim.factSource} ←
              </a>
            </>
          )}
        </div>
        <span className="bg-gray-100 px-2 py-0.5 rounded shrink-0">{claim.topic}</span>
      </div>
    </div>
  );
}
