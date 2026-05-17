import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "בדוק — בדיקת עובדות לפוליטיקאים ישראליים";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #f6f5f0 0%, #e8e4d8 100%)",
          fontFamily: "system-ui, sans-serif",
          direction: "rtl",
          padding: "80px",
        }}
      >
        {/* Brand mark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "24px",
            marginBottom: "40px",
          }}
        >
          <div
            style={{
              width: "120px",
              height: "120px",
              borderRadius: "28px",
              background: "#2563eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "80px",
              color: "white",
              fontWeight: 900,
            }}
          >
            ✓
          </div>
          <div
            style={{
              fontSize: "140px",
              fontWeight: 900,
              color: "#0f172a",
              letterSpacing: "-4px",
              display: "flex",
            }}
          >
            בדוק
          </div>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: "48px",
            color: "#0f172a",
            textAlign: "center",
            maxWidth: "900px",
            lineHeight: 1.25,
            fontWeight: 700,
            display: "flex",
          }}
        >
          מי הפוליטיקאי הכי ישר השבוע?
        </div>

        <div
          style={{
            fontSize: "28px",
            color: "#475569",
            marginTop: "24px",
            display: "flex",
          }}
        >
          בדיקת עובדות לפוליטיקאים ישראליים · ללא שיוך פוליטי
        </div>
      </div>
    ),
    { ...size },
  );
}
