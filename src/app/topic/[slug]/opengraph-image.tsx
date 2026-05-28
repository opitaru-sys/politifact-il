import { ImageResponse } from "next/og";
import { slugToTopicLabel } from "@/lib/topics";
import { getPoliticianStatsForTopic } from "@/lib/topic-stats";
import {
  OG_SIZE,
  OG_CONTENT_TYPE,
  NEWSPRINT,
  ogScoreColor,
  rtlHe,
  loadHebrewFont,
} from "@/lib/og";

/**
 * Per-topic share image. "How accurate are politicians on <topic>?" as a
 * single card — the average weighted-truth % plus sample size.
 *
 * force-dynamic: the topic page enumerates static params via
 * generateStaticParams, which would otherwise prerender this image at
 * build time and hit a possibly-suspended Neon. Keep it request-time.
 */
export const dynamic = "force-dynamic";
export const alt = "דיוק פוליטיקאים לפי נושא | בדוק";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function TopicOgImage({ params }: Props) {
  const { slug } = await params;
  const label = slugToTopicLabel(slug);

  const [bold, black] = await Promise.all([loadHebrewFont(700), loadHebrewFont(900)]);
  const fonts = [
    { name: "Rubik", data: bold, weight: 700 as const, style: "normal" as const },
    { name: "Rubik", data: black, weight: 900 as const, style: "normal" as const },
  ];

  if (!label) {
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

  const stats = await getPoliticianStatsForTopic(slug);
  const totalClaims = stats.reduce((s, x) => s + x.totalClaims, 0);
  const weighted = stats.reduce((s, x) => s + x.trueClaims + x.halfTrueClaims * 0.5, 0);
  const truthPct = totalClaims > 0 ? Math.round((weighted / totalClaims) * 100) : 0;
  const politicianCount = stats.length;
  const pctColor = ogScoreColor(truthPct);

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
            paddingBottom: "16px",
            borderBottom: `2px solid ${NEWSPRINT.ink}`,
            fontSize: "18px",
            color: NEWSPRINT.ink,
            letterSpacing: "4px",
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          <div style={{ display: "flex" }}>{rtlHe("בדוק · נושא")}</div>
        </div>

        {/* Hero: topic label + average accuracy */}
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
                color: pctColor,
                lineHeight: 1,
              }}
            >
              {totalClaims > 0 ? truthPct : "—"}
              {totalClaims > 0 && <span style={{ fontSize: 64 }}>%</span>}
            </div>
            <div style={{ display: "flex", fontSize: 22, color: NEWSPRINT.muted, marginTop: 6 }}>
              {rtlHe("אחוז אמת ממוצע")}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", maxWidth: "60%" }}>
            <div
              style={{
                display: "flex",
                fontSize: 90,
                fontWeight: 900,
                color: NEWSPRINT.ink,
                lineHeight: 1.05,
                textAlign: "right",
              }}
            >
              {rtlHe(label)}
            </div>
          </div>
        </div>

        {/* Bottom rule: sample size on the right, domain on the left */}
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
          <div style={{ display: "flex", alignItems: "center", fontSize: 24, color: NEWSPRINT.ink, fontWeight: 700 }}>
            <span style={{ marginLeft: 6 }}>{rtlHe("טענות")}</span>
            <span style={{ marginLeft: 18 }}>{totalClaims}</span>
            <span style={{ color: NEWSPRINT.hair, marginLeft: 18 }}>·</span>
            <span style={{ marginLeft: 6 }}>{rtlHe("פוליטיקאים")}</span>
            <span>{politicianCount}</span>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
