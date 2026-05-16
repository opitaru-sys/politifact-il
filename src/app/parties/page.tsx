import { getPartyStats } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function PartiesPage() {
  const stats = await getPartyStats();

  return (
    <div>
      <h1 className="text-2xl font-black mb-1">השוואת מפלגות</h1>
      <p className="text-sm text-gray-500 mb-6">איזו מפלגה הכי אמינה? דירוג לפי אחוז טענות שנמצאו אמת</p>

      <div className="space-y-3">
        {stats.map((stat, i) => {
          const falseWidth = (stat.falseClaims / stat.total) * 100;
          const halfWidth = (stat.halfTrue / stat.total) * 100;
          const trueWidth = (stat.trueClaims / stat.total) * 100;

          return (
            <div key={stat.party} className="bg-white rounded-xl border border-border p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-gray-400">{i + 1}</span>
                  <span className="font-bold">{stat.party}</span>
                </div>
                <span className={`font-bold ${stat.truthPercentage < 40 ? "text-red-600" : stat.truthPercentage < 60 ? "text-yellow-600" : "text-green-600"}`}>
                  {stat.truthPercentage}% אמינות
                </span>
              </div>

              <div className="h-4 rounded-full overflow-hidden flex bg-gray-100">
                <div className="bg-red-400 h-full" style={{ width: `${falseWidth}%` }} />
                <div className="bg-yellow-400 h-full" style={{ width: `${halfWidth}%` }} />
                <div className="bg-green-400 h-full" style={{ width: `${trueWidth}%` }} />
              </div>

              <div className="flex justify-between mt-2 text-xs text-gray-500">
                <span>❌ {stat.falseClaims} שקר</span>
                <span>⚠️ {stat.halfTrue} חצי אמת</span>
                <span>✅ {stat.trueClaims} אמת</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
