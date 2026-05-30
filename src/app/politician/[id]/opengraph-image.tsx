import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import {
  OG_SIZE,
  OG_CONTENT_TYPE,
  NEWSPRINT,
  VERDICT_OG,
  rtlHe,
  loadHebrewFont,
} from "@/lib/og";

/**
 * Per-politician share image — the share card that circulates when someone
 * shares a profile link. Shows the lie score (same metric the leaderboard
 * ranks by) + the verdict mix.
 *
 * force-dynamic: the politician page enumerates no static params but
 * other routes do; keep the image off the build-time prerender path so
 * a suspended Neon compute never crashes the build.
 */
export const dynamic = "force-dynamic";
export const alt = "תיק פוליטיקאי | בדוק";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PoliticianOgImage({ params }: Props) {
  const { id } = await params;
  const p = await prisma.politician.findFirst({
    where: { id },
    select: {
      name: true,
      party: true,
      claims: {
        where: { status: "published", editorApproved: true },
        select: { verdict: true },
      },
    },
  });

  const [bold, black] = await Promise.all([loadHebrewFont(700), loadHebrewFont(900)]);
  const fonts = [
    { name: "Rubik", data: bold, weight: 700 as const, style: "normal" as const },
    { name: "Rubik", data: black, weight: 900 as const, style: "normal" as const },
  ];

  if (!p) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: NEWSPRINT.bg,
            fontFamily: "Rubik, system-ui, sans-serif",
            fontSize: 96,
            fontWeight: 900,
            color: NEWSPRINT.ink,
          }}
        >
          <span style={{ color: NEWSPRINT.accent, marginInlineEnd: "8px" }}>.</span>
          {rtlHe("בדוק")}
        </div>
      ),
      { ...size, fonts },
    );
  }

  const total = p.claims.length;
  const trueC = p.claims.filter((c) => c.verdict === "true").length;
  const halfC = p.claims.filter((c) => c.verdict === "half-true").length;
  const falseC = p.claims.filter((c) => c.verdict === "false").length;
  const lieScore = falseC + halfC * 0.5;
  const scoreColor = VERDICT_OG.false.color;

  // Verdict columns, rendered right→left visually (Satori is LTR source-
  // ordered): false, half, true. Numbers stay outside rtlHe so they don't
  // reverse; labels are pure Hebrew.
  const verdictCols = [
    { n: falseC, ...VERDICT_OG.false },
    { n: halfC, ...VERDICT_OG["half-true"] },
    { n: trueC, ...VERDICT_OG.true },
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: NEWSPRINT.bg,
          fontFamily: "Rubik, system-ui, sans-serif",
          padding: "56px 70px",
        }}
      >
        {/* Top rule */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            paddingBottom: "16px",
            borderBottom: `2px solid ${NEWSPRINT.ink}`,
            fontSize: "18px",
            color: NEWSPRINT.ink,
            letterSpacing: "4px",
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          <div style={{ display: "flex" }}>{rtlHe("בדוק · תיק פוליטיקאי")}</div>
        </div>

        {/* Hero: score on the left, identity on the right */}
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: "28px",
            paddingBottom: "24px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                fontSize: 150,
                fontWeight: 900,
                color: scoreColor,
                lineHeight: 1,
              }}
            >
              {total > 0 ? lieScore : "—"}
            </div>
            <div style={{ display: "flex", fontSize: 22, color: NEWSPRINT.muted, marginTop: 6 }}>
              {rtlHe("ניקוד הטעיה")}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", maxWidth: "62%" }}>
            <div
              style={{
                display: "flex",
                fontSize: 68,
                fontWeight: 900,
                color: NEWSPRINT.ink,
                lineHeight: 1.1,
                textAlign: "right",
              }}
            >
              {rtlHe(p.name)}
            </div>
            <div style={{ display: "flex", fontSize: 28, color: NEWSPRINT.muted, marginTop: 10 }}>
              {rtlHe(p.party)}
            </div>
          </div>
        </div>

        {/* Bottom rule: verdict breakdown on the right, domain on the left */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: "20px",
            borderTop: `1px solid ${NEWSPRINT.hair}`,
          }}
        >
          <div style={{ display: "flex", fontSize: 22, fontWeight: 700, color: NEWSPRINT.muted, letterSpacing: 1 }}>
            bduk.co.il
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            {verdictCols.map((v, i) => (
              <div
                key={v.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  marginLeft: i === 0 ? 0 : 36,
                }}
              >
                <div style={{ display: "flex", fontSize: 40, fontWeight: 900, color: v.color, lineHeight: 1 }}>
                  {v.n}
                </div>
                <div style={{ display: "flex", fontSize: 18, color: NEWSPRINT.muted, marginTop: 4 }}>
                  {rtlHe(v.label)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
