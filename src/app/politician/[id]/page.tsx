import { getPoliticianById, getAllPoliticianIds } from "@/lib/data";
import { ClaimCard } from "@/components/ClaimCard";
import { PoliticianAvatar } from "@/components/PoliticianAvatar";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  const ids = await getAllPoliticianIds();
  return ids.map((id) => ({ id }));
}

export default async function PoliticianPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getPoliticianById(id);
  if (!data) notFound();

  const claims = data.claims;
  const trueClaims = claims.filter((c) => c.verdict === "true").length;
  const halfTrue = claims.filter((c) => c.verdict === "half-true").length;
  const falseClaims = claims.filter((c) => c.verdict === "false").length;
  const truthPct = claims.length > 0
    ? Math.round(((trueClaims + halfTrue * 0.5) / claims.length) * 100)
    : 0;

  return (
    <div>
      <div className="bg-white rounded-xl border border-border p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <PoliticianAvatar id={id} name={data.name} image={data.image} size="lg" />
          <div>
            <h1 className="text-2xl font-black">{data.name}</h1>
            <div className="text-sm text-gray-500">
              {data.party}
              {data.role && ` • ${data.role}`}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className={`text-xl font-bold ${truthPct < 40 ? "text-red-600" : truthPct < 60 ? "text-yellow-600" : "text-green-600"}`}>
              {truthPct}%
            </div>
            <div className="text-xs text-gray-500">אמינות</div>
          </div>
          <div className="bg-red-50 rounded-lg p-3">
            <div className="text-xl font-bold text-red-600">{falseClaims}</div>
            <div className="text-xs text-gray-500">שקר</div>
          </div>
          <div className="bg-yellow-50 rounded-lg p-3">
            <div className="text-xl font-bold text-yellow-600">{halfTrue}</div>
            <div className="text-xs text-gray-500">חצי אמת</div>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <div className="text-xl font-bold text-green-600">{trueClaims}</div>
            <div className="text-xs text-gray-500">אמת</div>
          </div>
        </div>
      </div>

      <h2 className="font-bold text-lg mb-3">כל הטענות שנבדקו ({claims.length})</h2>
      <div className="space-y-3">
        {claims.map((claim) => (
          <ClaimCard key={claim.id} claim={claim} />
        ))}
      </div>
    </div>
  );
}
