import { Suspense } from "react";
import type { Metadata } from "next";
import { getPoliticianById } from "@/lib/data";
import { MIN_CLAIMS_FOR_HERO } from "@/lib/data";
import { wilsonLowerBound } from "@/lib/queries";
import { getPoliticianTimeline } from "@/lib/cred-history";
import { ClaimCard } from "@/components/ClaimCard";
import { PoliticianAvatar } from "@/components/PoliticianAvatar";
import { WindowSelector } from "@/components/WindowSelector";
import { KnessetActivityCard } from "@/components/KnessetActivityCard";
import { CredibilityTimeline } from "@/components/CredibilityTimeline";
import { TopicBreakdown } from "@/components/TopicBreakdown";
import { resolveWindow, windowLabel } from "@/lib/window";
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

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ window?: string }>;
}

export default async function PoliticianPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { window: windowParam } = await searchParams;
  // Fetch politician details and credibility timeline in parallel — both
  // are independent DB queries. Timeline window is the maximum (12 months);
  // the chart filters in-memory based on its own 3/6/12 selector.
  const [data, timelinePoints] = await Promise.all([
    getPoliticianById(id),
    getPoliticianTimeline(id, 12),
  ]);
  if (!data) notFound();

  // Filter the politician's claims to the active stats window. The
  // page used to show all-time data while the leaderboard showed the
  // 30-day window — confusing visitors who landed here from the
  // leaderboard expecting matching numbers. Now they're aligned.
  const selected = resolveWindow(windowParam);
  const cutoff = selected.days ? new Date() : null;
  if (cutoff && selected.days) cutoff.setDate(cutoff.getDate() - selected.days);

  const filteredClaims = cutoff
    ? data.claims.filter((c) => new Date(c.date).getTime() >= cutoff.getTime())
    : data.claims;

  const trueClaims = filteredClaims.filter((c) => c.verdict === "true").length;
  const halfTrue = filteredClaims.filter((c) => c.verdict === "half-true").length;
  const falseClaims = filteredClaims.filter((c) => c.verdict === "false").length;
  const weightedTrue = trueClaims + halfTrue * 0.5;
  const truthPct =
    filteredClaims.length > 0
      ? Math.round((weightedTrue / filteredClaims.length) * 100)
      : 0;
  // Sample-adjusted credibility (Wilson 95% CI lower bound) — same metric
  // the leaderboard sorts by. Displayed here as the headline so the
  // profile page matches what visitors saw on the leaderboard.
  const credibilityScore =
    filteredClaims.length > 0
      ? Math.round(wilsonLowerBound(weightedTrue, filteredClaims.length) * 100)
      : 0;

  const scoreColor =
    credibilityScore < 40
      ? "var(--verdict-false)"
      : credibilityScore < 60
      ? "var(--verdict-half)"
      : "var(--verdict-true)";
  const sampleTooSmall = filteredClaims.length < MIN_CLAIMS_FOR_HERO;
  const totalAllTime = data.claims.length;
  const showAllTimeNote = totalAllTime > filteredClaims.length;

  return (
    <div>
      <div
        className="bg-card border border-border-strong p-7 mb-8"
        style={{ borderRadius: 4 }}
      >
        <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-4">תיק פוליטיקאי</div>
        <div className="flex items-center gap-5 mb-6 pb-6 border-b border-border">
          <PoliticianAvatar id={id} name={data.name} image={data.image} size="lg" priority />
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

        {/* Stats-window selector — same chips as /leaderboard and the home
            hero, so a visitor arriving from the leaderboard with "?window=90"
            sees identical numbers on both pages. */}
        <div className="mb-4 flex items-baseline justify-between gap-3 flex-wrap">
          <span className="text-[11px] uppercase tracking-wider text-foreground-muted">
            סטטיסטיקה · {windowLabel(selected.value)}
          </span>
          <WindowSelector basePath={`/politician/${id}`} selectedValue={selected.value} />
        </div>

        {sampleTooSmall && filteredClaims.length > 0 && (
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
            רק {filteredClaims.length} טענות בתקופה זו. הציון המוצג כבר מתוקנן מטה אוטומטית לפי גודל המדגם — אבל
            עד שיש לפחות {MIN_CLAIMS_FOR_HERO} טענות, המספר עדיין רעשני. הרחיבו את חלון הזמן או הסתכלו על המספרים
            כהערכה ראשונית בלבד.
          </div>
        )}

        {filteredClaims.length === 0 && (
          <div
            className="mb-4 px-4 py-3 text-[12px] leading-snug border bg-card"
            style={{ borderColor: "var(--border)", borderRadius: 2 }}
          >
            <strong>אין טענות בתקופה הזו.</strong>{" "}
            {totalAllTime > 0 ? (
              <>
                ל-{data.name} יש {totalAllTime} טענות בסה״כ במאגר.{" "}
                <a href={`/politician/${id}?window=90`} className="underline font-bold">
                  הצג 3 חודשים ←
                </a>
              </>
            ) : (
              "טרם נמצאו טענות במאגר עבור הפוליטיקאי הזה."
            )}
          </div>
        )}

        <div className="grid grid-cols-4 gap-0 border border-border" style={{ borderRadius: 2 }}>
          <div className="px-3 py-4 text-center border-l border-border">
            <div
              className={`text-3xl font-black tabular-nums leading-none ${sampleTooSmall ? "opacity-50" : ""}`}
              style={{ color: scoreColor }}
              title={`ציון מתוקנן לגודל מדגם. אחוז האמת הגולמי: ${truthPct}% מתוך ${filteredClaims.length} טענות.${sampleTooSmall ? " מדגם קטן מדי לדירוג מהימן." : ""}`}
            >
              {credibilityScore}
              <span className="text-lg">%</span>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-foreground-muted mt-1.5">
              ציון אמינות
            </div>
            <div className="text-[9px] text-foreground-muted/70 tabular-nums mt-0.5">
              {truthPct}% אמת
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

        {showAllTimeNote && (
          <p className="text-[11px] text-foreground-muted mt-3">
            סך הכל ל-{data.name} {totalAllTime} טענות במאגר.{" "}
            {selected.value !== "90" && (
              <a
                href={`/politician/${id}?window=90`}
                className="underline font-bold hover:text-accent"
              >
                הצג 3 חודשים ←
              </a>
            )}
          </p>
        )}
      </div>

      {/* Credibility timeline — pre-baked CredibilitySnapshot rows
          (rolling 30-day Wilson, written nightly). Chart filters
          in-memory based on its 3/6/12-month selector. Hidden gracefully
          if the politician has no historical snapshots yet. */}
      {timelinePoints.length > 0 && (
        <div className="mb-8">
          <CredibilityTimeline
            points={timelinePoints.map((p) => ({
              asOf: p.asOf.toISOString(),
              totalClaims: p.totalClaims,
              truthPercentage: p.truthPercentage,
              credibilityScore: p.credibilityScore,
            }))}
          />
        </div>
      )}

      {/* Topic breakdown — Wilson score per normalized topic. Hidden
          when fewer than 2 topics meet the minimum-sample threshold
          (one row is just the headline restated). Pure in-memory work
          on the already-loaded filteredClaims, no extra DB query. */}
      <TopicBreakdown
        politicianId={id}
        claims={filteredClaims}
        windowLabel={windowLabel(selected.value)}
      />

      {/* Knesset activity card — plenum participation %, bill
          sponsorship, current committee/role roster. Rendered inside
          its own Suspense so a slow Knesset OData fetch doesn't
          block the credibility card paint above. Returns null
          (i.e. nothing rendered) for non-MKs or politicians not
          covered by the daily activity ingest. */}
      <Suspense fallback={null}>
        <KnessetActivityCard politicianId={id} politicianName={data.name} />
      </Suspense>

      <div className="flex items-baseline justify-between mb-5 pb-3 border-b-[1.5px] border-border-strong">
        <h2 className="font-black text-xl tracking-tight">
          טענות {windowLabel(selected.value)}
        </h2>
        <span className="text-[11px] uppercase tracking-wider text-foreground-muted tabular-nums">
          {filteredClaims.length} טענות
        </span>
      </div>
      <div className="space-y-4">
        {filteredClaims.map((claim) => (
          <ClaimCard key={claim.id} claim={claim} />
        ))}
      </div>
    </div>
  );
}
