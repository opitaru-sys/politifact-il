import type { PoliticianStatsRow } from "@/lib/queries";
import { PoliticianAvatar } from "./PoliticianAvatar";

export function LiarOfTheWeek({ stats }: { stats: PoliticianStatsRow[] }) {
  const topLiar = stats[0];
  if (!topLiar) return null;

  return (
    <div className="bg-gradient-to-bl from-red-50 to-orange-50 rounded-2xl border border-red-200 p-6 text-center">
      <div className="text-sm font-bold text-red-600 mb-2">🏆 שקרן השבוע</div>
      <div className="mx-auto mb-3">
        <PoliticianAvatar id={topLiar.politician.id} name={topLiar.politician.name} image={topLiar.politician.image} size="lg" />
      </div>
      <div className="text-xl font-black mb-1">{topLiar.politician.name}</div>
      <div className="text-sm text-gray-600 mb-3">{topLiar.politician.party}</div>
      <div className="flex justify-center gap-4 text-sm">
        <div className="bg-white rounded-lg px-3 py-2 border border-red-100">
          <div className="text-red-600 font-bold text-lg">{topLiar.falseClaims}</div>
          <div className="text-gray-500 text-xs">שקר</div>
        </div>
        <div className="bg-white rounded-lg px-3 py-2 border border-yellow-100">
          <div className="text-yellow-600 font-bold text-lg">{topLiar.halfTrueClaims}</div>
          <div className="text-gray-500 text-xs">חצי אמת</div>
        </div>
        <div className="bg-white rounded-lg px-3 py-2 border border-green-100">
          <div className="text-green-600 font-bold text-lg">{topLiar.trueClaims}</div>
          <div className="text-gray-500 text-xs">אמת</div>
        </div>
      </div>
      <div className="mt-4 text-xs text-gray-400">מבוסס על {topLiar.totalClaims} טענות שנבדקו ב-7 הימים האחרונים</div>
    </div>
  );
}
