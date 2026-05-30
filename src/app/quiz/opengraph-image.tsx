import { ImageResponse } from "next/og";
import {
  OG_SIZE,
  OG_CONTENT_TYPE,
  NEWSPRINT,
  rtlHe,
  loadHebrewFont,
} from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "בדוק היומי — אמת או שקר?";

// Invite card for the daily quiz. The colored-square row mirrors the Wordle-
// style result so the share preview signals "it's a guessing game".
export default async function Image() {
  const [rubik900, rubik400] = await Promise.all([
    loadHebrewFont(900),
    loadHebrewFont(400),
  ]);

  const squares = ["#16a34a", "#16a34a", "#b3242a", "#16a34a", "#ca8a04"];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: NEWSPRINT.bg,
          color: NEWSPRINT.ink,
          fontFamily: "Rubik",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 48,
            right: 64,
            display: "flex",
            fontSize: 32,
            fontWeight: 900,
            color: NEWSPRINT.accent,
          }}
        >
          בדוק
        </div>

        <div style={{ display: "flex", gap: 14, marginBottom: 44 }}>
          {squares.map((c, i) => (
            <div
              key={i}
              style={{ width: 68, height: 68, background: c, borderRadius: 8 }}
            />
          ))}
        </div>

        <div style={{ display: "flex", fontSize: 84, fontWeight: 900 }}>
          {rtlHe("בדוק היומי")}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 42,
            fontWeight: 400,
            color: NEWSPRINT.muted,
            marginTop: 18,
          }}
        >
          {rtlHe("אמת, חצי אמת, או שקר?")}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 34,
            fontWeight: 400,
            marginTop: 30,
          }}
        >
          {rtlHe("5 ציטוטים אמיתיים. נראה אתכם.")}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Rubik", data: rubik900, weight: 900, style: "normal" },
        { name: "Rubik", data: rubik400, weight: 400, style: "normal" },
      ],
    },
  );
}
