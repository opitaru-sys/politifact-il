import { getRecentClaims, getPoliticianStats, getAllPoliticiansLite } from "@/lib/data";
import { LiarOfTheWeek } from "@/components/LiarOfTheWeek";
import { ClaimCard } from "@/components/ClaimCard";
import { LeaderboardPreview } from "@/components/LeaderboardPreview";
import { SearchBar } from "@/components/SearchBar";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [recentClaims, stats, allPoliticians] = await Promise.all([
    getRecentClaims(30),
    getPoliticianStats(),
    getAllPoliticiansLite(),
  ]);

  return (
    <div className="space-y-8">
      {/* Hero intro */}
      <section className="text-center pt-2 pb-4">
        <h1 className="text-3xl md:text-4xl font-black mb-2 tracking-tight">
          מי הכי <span className="text-verdict-true">ישר</span> השבוע?
        </h1>
        <p className="text-sm md:text-base text-gray-600 max-w-xl mx-auto">
          בדיקת עובדות לכל טענה ציבורית של פוליטיקאי ישראלי — עם מקור, פסק דין, וקישור לבדיקה.
        </p>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LiarOfTheWeek stats={stats} />
        <LeaderboardPreview stats={stats} />
      </div>

      <SearchBar politicians={allPoliticians} />

      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-black text-xl">טענות אחרונות</h2>
          <span className="text-xs text-gray-400">{recentClaims.length} טענות ב-30 הימים האחרונים</span>
        </div>
        <div className="space-y-3">
          {recentClaims.map((claim, i) => (
            <div key={claim.id} className="card-in" style={{ animationDelay: `${i * 40}ms` }}>
              <ClaimCard claim={claim} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
