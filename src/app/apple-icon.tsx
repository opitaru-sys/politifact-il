import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

async function loadHebrewFont() {
  const css = await fetch(
    "https://fonts.googleapis.com/css2?family=Rubik:wght@900&display=swap&subset=hebrew",
    { headers: { "User-Agent": "Mozilla/5.0" } },
  ).then((r) => r.text());
  const match = css.match(/src: url\((https:[^)]+\.ttf)\)/);
  if (!match) throw new Error("Could not find Rubik font URL");
  return fetch(match[1]).then((r) => r.arrayBuffer());
}

export default async function AppleIcon() {
  const font = await loadHebrewFont();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#b3242a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Rubik",
          color: "#f5f1e8",
          fontWeight: 900,
          fontSize: 150,
          lineHeight: 1,
          borderRadius: 36,
        }}
      >
        ב
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Rubik", data: font, weight: 900, style: "normal" }],
    },
  );
}
