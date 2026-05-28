import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { parseDigestSlug } from "@/lib/digest-helpers";
import {
  OG_SIZE,
  OG_CONTENT_TYPE,
  NEWSPRINT,
  rtlHe,
  loadHebrewFont,
} from "@/lib/og";

/**
 * Per-issue share image for the weekly digest. The digest is the
 * flagship editorial product, so its link previews get a real cover
 * card (issue title + date) rather than the generic site OG.
 *
 * force-dynamic: keep the image off the build-time prerender path so a
 * suspended Neon compute can't crash the build.
 */
export const dynamic = "force-dynamic";
export const alt = "תובנות השבוע | בדוק";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

interface Props {
  params: Promise<{ weekOf: string }>;
}

function numericDate(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${d.getUTCFullYear()}`;
}

export default async function DigestOgImage({ params }: Props) {
  const { weekOf } = await params;
  const date = parseDigestSlug(weekOf);
  const digest = date
    ? await prisma.digest.findUnique({
        where: { weekOf: date },
        select: { title: true, status: true, weekOf: true },
      })
    : null;

  const [bold, black] = await Promise.all([loadHebrewFont(700), loadHebrewFont(900)]);
  const fonts = [
    { name: "Rubik", data: bold, weight: 700 as const, style: "normal" as const },
    { name: "Rubik", data: black, weight: 900 as const, style: "normal" as const },
  ];

  if (!digest || digest.status !== "published") {
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

  const title = digest.title.length > 90 ? digest.title.slice(0, 87) + "…" : digest.title;

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
        {/* Top rule — section label on the right, numeric date on the left */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: "16px",
            borderBottom: `2px solid ${NEWSPRINT.ink}`,
            fontSize: "18px",
            color: NEWSPRINT.ink,
            letterSpacing: "4px",
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          <div style={{ display: "flex" }}>{numericDate(digest.weekOf)}</div>
          <div style={{ display: "flex" }}>{rtlHe("בדוק · תובנות השבוע")}</div>
        </div>

        {/* Issue title, right-anchored and large */}
        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "flex-end",
            paddingTop: "28px",
            paddingBottom: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 64,
              fontWeight: 900,
              color: NEWSPRINT.ink,
              lineHeight: 1.2,
              textAlign: "right",
              maxWidth: "100%",
            }}
          >
            {rtlHe(title)}
          </div>
        </div>

        {/* Bottom rule */}
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
          <div style={{ display: "flex", fontSize: 22, color: NEWSPRINT.muted }}>
            {rtlHe("בדיקת עובדות לפוליטיקאים")}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
