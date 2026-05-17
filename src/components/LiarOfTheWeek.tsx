import type { PoliticianStatsRow } from "@/lib/queries";
import { PoliticianAvatar } from "./PoliticianAvatar";

export function LiarOfTheWeek({ stats }: { stats: PoliticianStatsRow[] }) {
  if (stats.length === 0) return null;

  // Most truthful = last in the array (sorted asc by truthPercentage)
  const mostHonest = stats[stats.length - 1];
  const leastHonest = stats[0];

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Hero: most honest */}
      <div className="relative bg-gradient-to-bl from-green-50 via-emerald-50 to-teal-50 rounded-2xl border border-green-200 p-6 text-center flex-1 overflow-hidden">
        {/* Decorative ribbon corner */}
        <div className="absolute -top-1 -left-1 w-20 h-20 opacity-20 pointer-events-none">
          <svg viewBox="0 0 80 80" className="w-full h-full text-green-600">
            <path d="M0 0 L80 0 L80 80 Z" fill="currentColor" />
          </svg>
        </div>
        {/* Floating sparkles */}
        <div className="absolute top-4 right-6 text-2xl opacity-40 select-none" aria-hidden="true">✨</div>
        <div className="absolute bottom-8 left-6 text-xl opacity-30 select-none" aria-hidden="true">⭐</div>

        <div className="relative">
          <div className="inline-flex items-center gap-1.5 bg-green-600 text-white text-xs font-bold px-3 py-1 rounded-full mb-3 shadow-sm">
            🏆 ישר השבוע
          </div>

          <div className="mx-auto mb-3 relative inline-block">
            {/* Soft halo around avatar */}
            <div className="absolute inset-0 -m-2 rounded-full bg-gradient-to-br from-yellow-200 to-amber-100 opacity-60 blur-md" aria-hidden="true" />
            <div className="relative">
              <PoliticianAvatar
                id={mostHonest.politician.id}
                name={mostHonest.politician.name}
                image={mostHonest.politician.image}
                size="lg"
              />
            </div>
          </div>

          <div className="text-xl font-black mb-1">{mostHonest.politician.name}</div>
          <div className="text-sm text-gray-600 mb-4">{mostHonest.politician.party}</div>

          <div className="flex justify-center gap-2 text-sm mb-4">
            <div className="bg-white/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-green-100">
              <div className="text-green-600 font-bold text-lg">{mostHonest.trueClaims}</div>
              <div className="text-gray-500 text-xs">אמת</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-yellow-100">
              <div className="text-yellow-600 font-bold text-lg">{mostHonest.halfTrueClaims}</div>
              <div className="text-gray-500 text-xs">חצי</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-red-100">
              <div className="text-red-600 font-bold text-lg">{mostHonest.falseClaims}</div>
              <div className="text-gray-500 text-xs">שקר</div>
            </div>
          </div>

          <div className="text-4xl font-black text-green-700 leading-none">{mostHonest.truthPercentage}%</div>
          <div className="text-xs text-green-700 font-medium mt-1">אמינות</div>
          <div className="text-[11px] text-gray-500 mt-2">מתוך {mostHonest.totalClaims} טענות שנבדקו</div>

          <a
            href={`/politician/${mostHonest.politician.id}`}
            className="inline-flex items-center gap-1 mt-4 text-xs text-green-700 hover:text-green-900 font-medium hover:underline"
          >
            ראו את כל הטענות ←
          </a>
        </div>
      </div>

      {/* Secondary: least honest */}
      {leastHonest.politician.id !== mostHonest.politician.id && (
        <a
          href={`/politician/${leastHonest.politician.id}`}
          className="bg-red-50 rounded-xl border border-red-100 px-4 py-3 flex items-center gap-3 hover:bg-red-100 transition-colors"
        >
          <PoliticianAvatar
            id={leastHonest.politician.id}
            name={leastHonest.politician.name}
            image={leastHonest.politician.image}
            size="sm"
          />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-red-600 font-bold">פחות ישר השבוע</div>
            <div className="text-sm font-bold truncate">{leastHonest.politician.name}</div>
            <div className="text-xs text-gray-500">{leastHonest.falseClaims} שקר מתוך {leastHonest.totalClaims} טענות</div>
          </div>
          <div className="text-red-600 font-black text-lg shrink-0">{leastHonest.truthPercentage}%</div>
        </a>
      )}
    </div>
  );
}
