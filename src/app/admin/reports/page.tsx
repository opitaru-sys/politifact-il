import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ key?: string }>;
}

export default async function AdminReportsPage({ searchParams }: PageProps) {
  const { key } = await searchParams;
  if (!key || key !== process.env.ADMIN_SECRET) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-black mb-2">🔒 דף אדמין</h1>
        <p className="text-sm text-gray-500 mb-4">
          הוסף את <code className="bg-gray-100 px-2 py-1 rounded">?key=YOUR_SECRET</code> ל-URL
        </p>
      </div>
    );
  }

  const reports = await prisma.report.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      claim: { include: { politician: true } },
    },
  });

  if (reports.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-black mb-1">דיווחי שגיאה</h1>
        <p className="text-sm text-gray-500 mb-6">דיווחים מהקהל על טענות לא מדויקות</p>
        <div className="bg-white rounded-xl border border-border p-8 text-center text-gray-500">
          אין דיווחים עדיין
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-black mb-1">דיווחי שגיאה ({reports.length})</h1>
      <p className="text-sm text-gray-500 mb-6">דיווחים מהקהל על טענות לא מדויקות</p>

      <div className="space-y-3">
        {reports.map((r) => (
          <div key={r.id} className="bg-white rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-1 rounded">
                {r.reason}
              </span>
              <span className="text-xs text-gray-400">
                {new Date(r.createdAt).toLocaleString("he-IL")}
              </span>
            </div>
            <div className="mb-2">
              <a
                href={`/politician/${r.claim.politicianId}`}
                className="text-sm font-bold hover:underline"
              >
                {r.claim.politician.name}
              </a>
              <span className="text-xs text-gray-500"> · {r.claim.politician.party}</span>
            </div>
            <blockquote className="text-sm text-gray-800 mb-2 border-r-4 border-gray-200 pr-3">
              &ldquo;{r.claim.quote}&rdquo;
            </blockquote>
            <div className="text-xs text-gray-500 mb-1">
              פסק דין נוכחי: <strong>{r.claim.verdict}</strong>
            </div>
            {r.details && (
              <div className="mt-2 bg-gray-50 rounded-lg p-3 text-sm">
                <div className="text-xs font-bold text-gray-500 mb-1">פירוט המדווח:</div>
                {r.details}
              </div>
            )}
            <div className="mt-2 text-xs">
              <span className="text-gray-400">דיווח #{r.id} · </span>
              <span className="text-gray-400">claim {r.claimId}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
