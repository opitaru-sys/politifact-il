import { getPoliticianStats } from "@/lib/data";
import { PoliticianAvatar } from "@/components/PoliticianAvatar";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const stats = await getPoliticianStats();

  return (
    <div>
      <h1 className="text-2xl font-black mb-1">טבלת האמינות</h1>
      <p className="text-sm text-gray-500 mb-6">דירוג פוליטיקאים לפי אחוז הטענות שנמצאו אמת מתוך כלל הטענות שנבדקו</p>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 px-4 py-2 border-b border-border text-xs font-bold text-gray-500">
          <span>#</span>
          <span>פוליטיקאי</span>
          <span>אמינות</span>
          <span>טענות</span>
        </div>
        <div className="divide-y divide-border">
          {stats.map((stat, i) => (
            <a
              key={stat.politician.id}
              href={`/politician/${stat.politician.id}`}
              className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 items-center px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <span className="text-lg font-bold text-gray-400 w-6">{i + 1}</span>
              <div className="flex items-center gap-2">
                <PoliticianAvatar id={stat.politician.id} name={stat.politician.name} image={stat.politician.image} size="sm" />
                <div>
                  <div className="font-bold text-sm">{stat.politician.name}</div>
                  <div className="text-xs text-gray-500">{stat.politician.party}</div>
                </div>
              </div>
              <div className="text-left">
                <div className={`font-bold ${stat.truthPercentage < 40 ? "text-red-600" : stat.truthPercentage < 60 ? "text-yellow-600" : "text-green-600"}`}>
                  {stat.truthPercentage}%
                </div>
              </div>
              <div className="flex gap-1 text-xs">
                <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded">{stat.falseClaims}</span>
                <span className="bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">{stat.halfTrueClaims}</span>
                <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{stat.trueClaims}</span>
              </div>
            </a>
          ))}
        </div>
      </div>

      <div className="mt-4 text-xs text-gray-400 text-center">
        אמינות = (טענות אמת + 0.5 × חצי אמת) / סה&quot;כ טענות שנבדקו
      </div>
    </div>
  );
}
