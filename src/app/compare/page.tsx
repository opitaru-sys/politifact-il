import type { Metadata } from "next";
import { getPoliticianById, getPoliticiansWithClaimsLite } from "@/lib/data";
import { PoliticianAvatar } from "@/components/PoliticianAvatar";
import { VerdictBadge } from "@/components/VerdictBadge";
import { CompareSelector } from "@/components/CompareSelector";
import { topicDisplayLabel } from "@/lib/topics";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "השוואה | בדוק",
  description: "השוואה צד-לצד של אמינות שני פוליטיקאים על בסיס הטענות שנבדקו.",
};

function scoreColor(pct: number): string {
  if (pct < 40) return "var(--verdict-false)";
  if (pct < 60) return "var(--verdict-half)";
  return "var(--verdict-true)";
}

interface PageProps {
  searchParams: Promise<{ a?: string; b?: string }>;
}

interface PoliticianStats {
  id: string;
  name: string;
  party: string;
  role: string | null;
  image: string | null;
  total: number;
  trueClaims: number;
  halfTrueClaims: number;
  falseClaims: number;
  truthPct: number;
  recentClaims: { quote: string; verdict: string; date: string; topic: string; id: string }[];
}

async function loadStats(id: string): Promise<PoliticianStats | null> {
  const p = await getPoliticianById(id);
  if (!p) return null;
  const claims = p.claims;
  const trueClaims = claims.filter((c) => c.verdict === "true").length;
  const halfTrueClaims = claims.filter((c) => c.verdict === "half-true").length;
  const falseClaims = claims.filter((c) => c.verdict === "false").length;
  const total = claims.length;
  const truthPct = total > 0 ? Math.round(((trueClaims + halfTrueClaims * 0.5) / total) * 100) : 0;
  return {
    id: p.id,
    name: p.name,
    party: p.party,
    role: p.role ?? null,
    image: p.image ?? null,
    total,
    trueClaims,
    halfTrueClaims,
    falseClaims,
    truthPct,
    recentClaims: claims.slice(0, 3).map((c) => ({
      id: c.id,
      quote: c.quote,
      verdict: c.verdict,
      date: c.date,
      topic: c.topic,
    })),
  };
}

export default async function ComparePage({ searchParams }: PageProps) {
  const { a, b } = await searchParams;
  const [statsA, statsB, allPoliticians] = await Promise.all([
    a ? loadStats(a) : Promise.resolve(null),
    b ? loadStats(b) : Promise.resolve(null),
    // Only politicians who actually have published claims appear in
    // the dropdown so users can't pick a dead-end.
    getPoliticiansWithClaimsLite(),
  ]);

  return (
    <div>
      <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-3">השוואה</div>
      <h1 className="text-4xl font-black mb-3 tracking-tight">השוואת אמינות</h1>
      <p className="text-sm text-foreground-muted mb-8 max-w-2xl leading-relaxed">
        בחר שני פוליטיקאים ובחן את התפלגות פסקי הדין שלהם זה לצד זה.
      </p>

      <CompareSelector
        politicians={allPoliticians}
        selectedA={a ?? null}
        selectedB={b ?? null}
      />

      {statsA && statsB ? (
        <div className="grid grid-cols-2 gap-3 md:gap-5">
          <PoliticianColumn stats={statsA} />
          <PoliticianColumn stats={statsB} />
        </div>
      ) : (
        <div
          className="bg-card border border-border p-8 text-center text-foreground-muted text-sm mt-8"
          style={{ borderRadius: 4 }}
        >
          בחר שני פוליטיקאים מהתפריטים למעלה.
        </div>
      )}
    </div>
  );
}

function PoliticianColumn({ stats }: { stats: PoliticianStats }) {
  return (
    <div
      className="bg-card border border-border-strong p-5"
      style={{ borderRadius: 4 }}
    >
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border">
        <PoliticianAvatar id={stats.id} name={stats.name} image={stats.image} size="md" />
        <div className="min-w-0">
          <a
            href={`/politician/${stats.id}`}
            className="font-black text-lg tracking-tight hover:text-accent"
          >
            {stats.name}
          </a>
          <div className="text-[11px] text-foreground-muted uppercase tracking-wider mt-0.5 truncate">
            {stats.party}
          </div>
        </div>
      </div>

      <div className="text-center mb-4">
        {stats.total === 0 ? (
          <>
            <div className="text-base font-bold text-foreground-muted leading-tight mt-3 mb-1.5">
              אין מספיק נתונים
            </div>
            <div className="text-[11px] text-foreground-muted leading-relaxed max-w-[14rem] mx-auto">
              טרם נבדקו טענות של {stats.name} בתקופה זו. נסו פוליטיקאי אחר או בקרו בעמוד הפוליטיקאי.
            </div>
          </>
        ) : stats.total < 3 ? (
          <>
            <div
              className="text-5xl font-black leading-none tabular-nums opacity-60"
              style={{ color: scoreColor(stats.truthPct) }}
            >
              {stats.truthPct}
              <span className="text-2xl">%</span>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-foreground-muted/80 mt-1.5 italic">
              מדגם קטן · {stats.total} טענות
            </div>
          </>
        ) : (
          <>
            <div
              className="text-5xl font-black leading-none tabular-nums"
              style={{ color: scoreColor(stats.truthPct) }}
            >
              {stats.truthPct}
              <span className="text-2xl">%</span>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-foreground-muted mt-1.5">
              אמינות · {stats.total} טענות
            </div>
          </>
        )}
      </div>

      {stats.total > 0 && (
        <div className="grid grid-cols-3 border border-border" style={{ borderRadius: 2 }}>
          <div className="py-2 text-center border-l border-border">
            <div className="font-black text-base tabular-nums" style={{ color: "var(--verdict-true)" }}>
              {stats.trueClaims}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-foreground-muted">אמת</div>
          </div>
          <div className="py-2 text-center border-l border-border">
            <div className="font-black text-base tabular-nums" style={{ color: "var(--verdict-half)" }}>
              {stats.halfTrueClaims}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-foreground-muted">חצי</div>
          </div>
          <div className="py-2 text-center">
            <div className="font-black text-base tabular-nums" style={{ color: "var(--verdict-false)" }}>
              {stats.falseClaims}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-foreground-muted">שקר</div>
          </div>
        </div>
      )}

      {stats.recentClaims.length > 0 && (
        <div className="mt-5">
          <div className="text-[10px] uppercase tracking-wider text-foreground-muted mb-2 font-bold">
            טענות אחרונות
          </div>
          <ul className="space-y-3">
            {stats.recentClaims.map((c) => (
              <li key={c.id} className="text-xs">
                <a href={`/claim/${c.id}`} className="block hover:bg-muted/40 -mx-1 px-1 py-1">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <VerdictBadge verdict={c.verdict as "true" | "half-true" | "false"} />
                    <span className="text-[10px] uppercase tracking-wider text-foreground-muted truncate max-w-[8rem]" title={c.topic}>{topicDisplayLabel(c.topic)}</span>
                  </div>
                  <blockquote className="leading-snug line-clamp-3">
                    &ldquo;{c.quote}&rdquo;
                  </blockquote>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
