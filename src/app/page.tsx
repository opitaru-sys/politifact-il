import { getRecentClaims, getPoliticianStats } from "@/lib/data";
import { LiarOfTheWeek } from "@/components/LiarOfTheWeek";
import { ClaimCard } from "@/components/ClaimCard";
import { LeaderboardPreview } from "@/components/LeaderboardPreview";
import { SearchBar } from "@/components/SearchBar";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [recentClaims, stats] = await Promise.all([
    getRecentClaims(7),
    getPoliticianStats(),
  ]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LiarOfTheWeek stats={stats} />
        <LeaderboardPreview stats={stats} />
      </div>

      <SearchBar />

      <section>
        <h2 className="font-bold text-lg mb-3">טענות אחרונות</h2>
        <div className="space-y-3">
          {recentClaims.map((claim) => (
            <ClaimCard key={claim.id} claim={claim} />
          ))}
        </div>
      </section>
    </div>
  );
}
