import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { rtlHe, wrapRtl } from "@/lib/og";

/**
 * Per-claim share image.
 *
 * Next.js auto-attaches any `opengraph-image.tsx` file in a route to that
 * page's <meta property="og:image">. When someone shares a claim URL on
 * WhatsApp / X / LinkedIn / Telegram, the link preview shows this image
 * instead of the generic site OG. That's the unit that actually circulates
 * — people don't share links to fact-check databases, they share
 * screenshots that make a point.
 *
 * Format: 1200×630 (landscape). Same dimensions as the root site OG so
 * the layout system stays predictable. Square (1200×1200) is more
 * screenshot-friendly for stories but every platform also accepts
 * landscape — keeping one ratio simplifies the visual system.
 *
 * RTL note: Satori does NOT apply Unicode bidi to Hebrew. The trick used
 * in the root opengraph-image.tsx — `rtlHe()` reversing the entire string
 * — works for pure-Hebrew runs. For this card, the quote may contain
 * mixed Hebrew/Latin (English brand names, numbers), so we apply the same
 * "reverse the whole codepoint sequence" trick AND accept that mixed
 * runs will read in reverse Latin. Long term the right fix is a real
 * bidi pass, but the corpus is overwhelmingly pure Hebrew.
 */

// NOT edge — we query Prisma here. Edge runtime requires Prisma Accelerate
// (we don't have it). Node runtime is the default and handles the OG render
// fine — Vercel caches the response by URL so cold-start hits are rare.
export const alt = "טענה שנבדקה | בדוק";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function loadHebrewFont(weight: 400 | 700 | 900): Promise<ArrayBuffer> {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=Rubik:wght@${weight}&display=swap&subset=hebrew`,
    { headers: { "User-Agent": "Mozilla/5.0" } },
  ).then((r) => r.text());
  const match = css.match(/src: url\((https:[^)]+\.ttf)\)/);
  if (!match) throw new Error("Could not find Rubik font URL");
  return fetch(match[1]).then((r) => r.arrayBuffer());
}

// Visual mapping mirrors VerdictBadge component colors so the share image
// matches what visitors see on the actual claim card.
const VERDICT_DISPLAY: Record<string, { label: string; bg: string; fg: string }> = {
  true: { label: "אמת", bg: "#16a34a", fg: "#ffffff" },
  "half-true": { label: "חצי אמת", bg: "#ca8a04", fg: "#ffffff" },
  false: { label: "שקר", bg: "#b3242a", fg: "#ffffff" },
};

interface Props {
  // Next 16 — every dynamic route param is a Promise. Same convention as
  // the page component in this folder.
  params: Promise<{ id: string }>;
}

export default async function ClaimOgImage({ params }: Props) {
  const { id } = await params;
  const c = await prisma.claim.findFirst({
    where: { id, status: "published", editorApproved: true },
    include: { politician: { select: { name: true, party: true } } },
  });

  // If the claim isn't found (deleted, unapproved, wrong ID) we fall back
  // to a minimal "בדוק" card so link previews don't 404. Better than no
  // image at all.
  const [bold, black] = await Promise.all([loadHebrewFont(700), loadHebrewFont(900)]);
  const fonts = [
    { name: "Rubik", data: bold, weight: 700 as const, style: "normal" as const },
    { name: "Rubik", data: black, weight: 900 as const, style: "normal" as const },
  ];

  if (!c) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#f5f1e8",
            fontFamily: "Rubik, system-ui, sans-serif",
            fontSize: 96,
            fontWeight: 900,
            color: "#1a1a1a",
          }}
        >
          <span style={{ color: "#b3242a", marginInlineEnd: "8px" }}>.</span>
          {rtlHe("בדוק")}
        </div>
      ),
      { ...size, fonts },
    );
  }

  const verdict = VERDICT_DISPLAY[c.verdict] ?? VERDICT_DISPLAY["half-true"];
  // Cap quote length so it always fits inside the card. ~180 chars renders
  // in ~3 lines at the chosen font size; longer truncates with ellipsis.
  const quoteText = c.quote.length > 180 ? c.quote.slice(0, 177) + "…" : c.quote;
  const dateLabel = c.date.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

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
          padding: "56px 70px",
          position: "relative",
        }}
      >
        {/* Top rule — dateline + verdict pill on the right.
            Source order matters because Satori arranges flex children
            left-to-right regardless of direction styles. */}
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
          <div style={{ display: "flex" }}>{rtlHe(`בדוק · ${dateLabel}`)}</div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "6px 18px",
              background: verdict.bg,
              color: verdict.fg,
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: 2,
            }}
          >
            {rtlHe(verdict.label)}
          </div>
        </div>

        {/* Quote body — flex-end on the cross-axis anchors children to
            the visual right edge (Hebrew reading start). */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "center",
            alignItems: "flex-end",
            paddingTop: "32px",
            paddingBottom: "24px",
          }}
        >
          {wrapRtl(`"${quoteText}"`, 34).map((line, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                fontSize: 46,
                fontWeight: 700,
                color: "#1a1a1a",
                lineHeight: 1.25,
              }}
            >
              {line}
            </div>
          ))}
        </div>

        {/* Bottom rule — politician name on right (RTL start), domain on
            left. Politician name is large and bold so the speaker is the
            visual anchor under the quote. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: "20px",
            borderTop: "1px solid #d9d2c0",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 22,
              fontWeight: 700,
              color: "#4a4a4a",
              letterSpacing: 1,
            }}
          >
            bduk.co.il
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 32,
                fontWeight: 900,
                color: "#1a1a1a",
                letterSpacing: -0.5,
              }}
            >
              {rtlHe(c.politician.name)}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 18,
                color: "#4a4a4a",
                marginTop: 2,
              }}
            >
              {rtlHe(c.politician.party)}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
