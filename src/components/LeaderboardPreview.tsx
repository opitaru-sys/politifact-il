import type { PoliticianStatsRow } from "@/lib/queries";
import { PoliticianAvatar } from "./PoliticianAvatar";

export function LeaderboardPreview({ stats }: { stats: PoliticianStatsRow[] }) {
  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden h-full flex flex-col">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h2 className="font-bold text-lg">📊 טבלת האמינות</h2>
        <a href="/leaderboard" className="text-sm text-blue-600 hover:underline">הכל →</a>
      </div>
      <div className="divide-y divide-border flex-1">
        {[...stats].reverse().slice(0, 5).map((stat, i) => (
          <a
            key={stat.politician.id}
            href={`/politician/${stat.politician.id}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
          >
            <span className="text-lg font-bold text-gray-400 w-6">{i + 1}</span>
            <PoliticianAvatar id={stat.politician.id} name={stat.politician.name} image={stat.politician.image} size="sm" />
            <div className="flex-1">
              <div className="font-medium text-sm">{stat.politician.name}</div>
              <div className="text-xs text-gray-500">{stat.politician.party}</div>
            </div>
            <div className="text-left">
              <div className={`font-bold text-sm ${stat.truthPercentage < 40 ? "text-red-600" : stat.truthPercentage < 60 ? "text-yellow-600" : "text-green-600"}`}>
                {stat.truthPercentage}% אמת
              </div>
              <div className="text-xs text-gray-400">{stat.totalClaims} טענות</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
