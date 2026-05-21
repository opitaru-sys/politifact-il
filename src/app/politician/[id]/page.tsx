import type { Metadata } from "next";
import { getPoliticianById } from "@/lib/data";
import { MIN_CLAIMS_FOR_HERO } from "@/lib/data";
import { ClaimCard } from "@/components/ClaimCard";
import { PoliticianAvatar } from "@/components/PoliticianAvatar";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await getPoliticianById(id);
  if (!data) return {};
  return {
    title: `${data.name} | בדוק`,
    description: `בדיקת עובדות לטענות של ${data.name} (${data.party})`,
  };
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

  const scoreColor =
    truthPct < 40
      ? "var(--verdict-false)"
      : truthPct < 60
      ? "var(--verdict-half)"
      : "var(--verdict-true)";
  const sampleTooSmall = claims.length < MIN_CLAIMS_FOR_HERO;

  return (
    <div>
      <div
        className="bg-card border border-border-strong p-7 mb-8"
        style={{ borderRadius: 4 }}
      >
        <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-4">תיק פוליטיקאי</div>
        <div className="flex items-center gap-5 mb-6 pb-6 border-b border-border">
          <PoliticianAvatar id={id} name={data.name} image={data.image} size="lg" />
          <div>
            <h1 className="text-3xl font-black tracking-tight">{data.name}</h1>
            <div className="text-sm text-foreground-muted mt-1">
              <span className="font-bold text-foreground">{data.party}</span>
              {data.role && (
                <>
                  <span className="mx-2 opacity-40">·</span>
                  {data.role}
                </>
              )}
            </div>
          </div>
        </div>

        {sampleTooSmall && (
          <div
            className="mb-4 px-4 py-3 text-[11px] leading-snug border"
            style={{
              backgroundColor: "var(--verdict-half-bg)",
              color: "var(--verdict-half)",
              borderColor: "var(--verdict-half)",
              borderRadius: 2,
            }}
          >
            <strong className="tracking-wider uppercase ml-1">מדגם קטן.</strong>
            רק {claims.length} טענות נבדקו עד כה. אחוז האמינות לא נחשב אינדיקציה אמינה עד שיש לפחות {MIN_CLAIMS_FOR_HERO} טענות.
          </div>
        )}

        <div className="grid grid-cols-4 gap-0 border border-border" style={{ borderRadius: 2 }}>
          <div className="px-3 py-4 text-center border-l border-border">
            <div
              className={`text-3xl font-black tabular-nums leading-none ${sampleTooSmall ? "opacity-50" : ""}`}
              style={{ color: scoreColor }}
              title={sampleTooSmall ? "מדגם קטן מדי לדירוג מהימן" : undefined}
            >
              {truthPct}
              <span className="text-lg">%</span>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-foreground-muted mt-1.5">
              אמינות
            </div>
          </div>
          <div className="px-3 py-4 text-center border-l border-border">
            <div
              className="text-3xl font-black tabular-nums leading-none"
              style={{ color: "var(--verdict-false)" }}
            >
              {falseClaims}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-foreground-muted mt-1.5">
              שקר
            </div>
          </div>
          <div className="px-3 py-4 text-center border-l border-border">
            <div
              className="text-3xl font-black tabular-nums leading-none"
              style={{ color: "var(--verdict-half)" }}
            >
              {halfTrue}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-foreground-muted mt-1.5">
              חצי אמת
            </div>
          </div>
          <div className="px-3 py-4 text-center border-l border-border">
            <div
              className="text-3xl font-black tabular-nums leading-none"
              style={{ color: "var(--verdict-true)" }}
            >
              {trueClaims}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-foreground-muted mt-1.5">
              אמת
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-baseline justify-between mb-5 pb-3 border-b-[1.5px] border-border-strong">
        <h2 className="font-black text-xl tracking-tight">כל הטענות שנבדקו</h2>
        <span className="text-[11px] uppercase tracking-wider text-foreground-muted tabular-nums">
          {claims.length} טענות
        </span>
      </div>
      <div className="space-y-4">
        {claims.map((claim) => (
          <ClaimCard key={claim.id} claim={claim} />
        ))}
      </div>
    </div>
  );
}
