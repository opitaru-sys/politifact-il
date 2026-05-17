import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "בדוק | בדיקת עובדות לפוליטיקאים ישראליים";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Load Rubik (Hebrew-capable) from Google Fonts.
async function loadHebrewFont(weight: 400 | 700 | 900) {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=Rubik:wght@${weight}&display=swap&subset=hebrew`,
    { headers: { "User-Agent": "Mozilla/5.0" } },
  ).then((r) => r.text());
  const match = css.match(/src: url\((https:[^)]+\.ttf)\)/);
  if (!match) throw new Error("Could not find Rubik font URL");
  const fontData = await fetch(match[1]).then((r) => r.arrayBuffer());
  return fontData;
}

/**
 * Satori does NOT apply the Unicode bidi algorithm — Hebrew text renders
 * character-by-character left-to-right. The workaround is to pre-reverse
 * any Hebrew-containing string and reverse word order back so the visual
 * result reads correctly.
 *
 * Pure-Latin substrings (like "baduk.org.il") are kept intact.
 */
function rtl(s: string): string {
  return s
    .split(" ")
    .reverse()
    .map((word) => {
      // Word contains Hebrew? Reverse its characters. Otherwise leave as-is.
      if (/[֐-׿]/.test(word)) {
        return Array.from(word).reverse().join("");
      }
      return word;
    })
    .join(" ");
}

export default async function OpenGraphImage() {
  const [bold, black] = await Promise.all([loadHebrewFont(700), loadHebrewFont(900)]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#f5f1e8",
          fontFamily: "Rubik, system-ui, sans-serif",
          direction: "rtl",
          padding: "70px",
          position: "relative",
        }}
      >
        {/* Top rule + dateline */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: "16px",
            borderBottom: "2px solid #1a1a1a",
            fontSize: "18px",
            color: "#1a1a1a",
            letterSpacing: "4px",
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          <div style={{ display: "flex" }}>{rtl("בדיקת עובדות · פוליטיקה ישראלית")}</div>
          <div style={{ display: "flex", color: "#b3242a" }}>{rtl("מהדורה שבועית")}</div>
        </div>

        {/* Headline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: "160px",
              fontWeight: 900,
              color: "#1a1a1a",
              letterSpacing: "-6px",
              display: "flex",
              alignItems: "baseline",
              lineHeight: 0.95,
            }}
          >
            {rtl("בדוק")}
            <span style={{ color: "#b3242a", marginInlineStart: "4px" }}>.</span>
          </div>
          <div
            style={{
              fontSize: "44px",
              color: "#1a1a1a",
              fontWeight: 700,
              marginTop: "24px",
              display: "flex",
              maxWidth: "900px",
              lineHeight: 1.2,
            }}
          >
            {rtl("?מי הפוליטיקאי הכי אמין")}
          </div>
        </div>

        {/* Bottom rule */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: "16px",
            borderTop: "1px solid #d9d2c0",
            fontSize: "20px",
            color: "#4a4a4a",
          }}
        >
          <div style={{ display: "flex" }}>{rtl("ללא שיוך פוליטי · מעודכן יומית")}</div>
          <div style={{ display: "flex", fontWeight: 700 }}>baduk.org.il</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Rubik", data: bold, weight: 700, style: "normal" },
        { name: "Rubik", data: black, weight: 900, style: "normal" },
      ],
    },
  );
}
