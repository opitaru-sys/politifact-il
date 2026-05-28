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
  return fetch(match[1]).then((r) => r.arrayBuffer());
}

/**
 * Satori does NOT apply the Unicode bidi algorithm to Hebrew text, even
 * with `direction: "rtl"` on the container. To get Hebrew that reads
 * correctly in the rendered PNG, we have to pre-arrange the source so
 * that when Satori dumps glyphs left-to-right, a native Hebrew reader
 * scanning right-to-left sees the intended sentence.
 *
 * The earlier implementation split by space and reversed words AND
 * chars inside Hebrew words — but it left the question mark attached
 * to its source-leading word, which then ended up in the middle of
 * the rendered sentence instead of at the end. Simpler and correct:
 * reverse the ENTIRE codepoint sequence. Punctuation and spaces flip
 * along with letters, which is exactly what we want for a pure-Hebrew
 * string. (Mixed Hebrew+Latin would need word-aware logic, but the
 * OG card only has pure-Hebrew text plus an isolated Latin URL that
 * never passes through this helper.)
 */
function rtlHe(s: string): string {
  return Array.from(s).reverse().join("");
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
          padding: "70px",
          position: "relative",
        }}
      >
        {/* Top rule. Satori arranges flex children left-to-right regardless
            of direction styles, so we put the Hebrew dateline FIRST in
            source (it lands on the LEFT of the row), with the red "weekly
            edition" tag LAST (lands on the right). That mirrors the
            visual rhythm of a Hebrew masthead: tag floats opposite the
            dateline. */}
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
          <div style={{ display: "flex" }}>{rtlHe("בדיקת עובדות · פוליטיקה ישראלית")}</div>
          <div style={{ display: "flex", color: "#b3242a" }}>{rtlHe("מהדורה שבועית")}</div>
        </div>

        {/* Headline. alignItems flex-end anchors children to the RIGHT
            edge of the column (since we're a vertical flex, cross-axis
            is horizontal). That's where Hebrew display starts. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "center",
            alignItems: "flex-end",
          }}
        >
          {/* Brand: red period then "בדוק" — in source order so Satori's
              LTR dump puts the period on the LEFT of the wordmark, which
              is the END of the word in Hebrew (correct: "בדוק." has the
              period after the last letter, which in RTL visual = LEFT). */}
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
            <span style={{ color: "#b3242a", marginInlineEnd: "4px" }}>.</span>
            <span>{rtlHe("בדוק")}</span>
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
            {rtlHe("מי הפוליטיקאי הכי מדויק?")}
          </div>
        </div>

        {/* Bottom rule. Domain (Latin, reads LTR naturally) on the left,
            Hebrew tagline on the right via space-between. */}
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
          <div style={{ display: "flex", fontWeight: 700 }}>bduk.co.il</div>
          <div style={{ display: "flex" }}>{rtlHe("ללא שיוך פוליטי · מעודכן יומית")}</div>
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
