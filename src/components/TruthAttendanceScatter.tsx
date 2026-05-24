"use client";

import { useState } from "react";

interface Point {
  politicianId: string;
  name: string;
  party: string;
  truthPct: number;
  attendancePct: number;
  totalClaims: number;
}

interface Props {
  points: Point[];
}

/**
 * 2D scatter: x = plenum participation %, y = credibility (truth) %.
 *
 * Reader-facing visual that combines the two main accountability
 * dimensions without forcing a weighted formula. The four quadrants
 * read intuitively:
 *
 *   ┌──────────────────┬──────────────────┐
 *   │ אמין אבל לא נוכח  │ אמין ופעיל ✓     │
 *   │ (high truth,     │ (high truth,    │
 *   │  low attendance) │  high attendance)│
 *   ├──────────────────┼──────────────────┤
 *   │ עוקפי האמת        │ נוכח אבל מטעה    │
 *   │ (low truth,      │ (low truth,     │
 *   │  low attendance) │  high attendance)│
 *   └──────────────────┴──────────────────┘
 *
 * Implemented as a single SVG so it stays sharp at every zoom level
 * and the bundle is one file. Hover/click on a point highlights it
 * and shows the name in a corner label — kept client-side because
 * pure SVG can't do hover without JS.
 *
 * Designed to feel like a newspaper chart: hairline axes, no grid
 * shimmer, no gradient fills. Dots in press-red for emphasis on
 * hover, foreground for the rest. The quadrant guide lines at 50%
 * are subtle dashes.
 */
export function TruthAttendanceScatter({ points }: Props) {
  const [hovered, setHovered] = useState<Point | null>(null);

  // SVG viewBox — square, generous padding for axis labels.
  const W = 480;
  const H = 480;
  const PAD = 48;
  const plotW = W - PAD * 2;
  const plotH = H - PAD * 2;

  function xFor(pct: number): number {
    return PAD + (pct / 100) * plotW;
  }
  function yFor(pct: number): number {
    // SVG y grows downward, so invert. y=0 → top, y=H → bottom.
    return PAD + (1 - pct / 100) * plotH;
  }

  return (
    <div className="bg-card border border-border-strong p-5" style={{ borderRadius: 4 }}>
      <div className="flex items-baseline justify-between mb-3 pb-2 border-b border-border">
        <h3 className="font-black text-base tracking-tight">אמינות מול נוכחות</h3>
        <span className="text-[11px] text-foreground-muted">{points.length} ח״כים</span>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
          {/* Axes */}
          <line
            x1={PAD}
            y1={H - PAD}
            x2={W - PAD}
            y2={H - PAD}
            stroke="var(--foreground)"
            strokeWidth={1.5}
          />
          <line
            x1={PAD}
            y1={PAD}
            x2={PAD}
            y2={H - PAD}
            stroke="var(--foreground)"
            strokeWidth={1.5}
          />

          {/* Quadrant guide lines at 50% — subtle dashes */}
          <line
            x1={xFor(50)}
            y1={PAD}
            x2={xFor(50)}
            y2={H - PAD}
            stroke="var(--border)"
            strokeWidth={1}
            strokeDasharray="3 4"
          />
          <line
            x1={PAD}
            y1={yFor(50)}
            x2={W - PAD}
            y2={yFor(50)}
            stroke="var(--border)"
            strokeWidth={1}
            strokeDasharray="3 4"
          />

          {/* Axis labels */}
          {[0, 25, 50, 75, 100].map((n) => (
            <g key={`x-${n}`}>
              <line
                x1={xFor(n)}
                y1={H - PAD}
                x2={xFor(n)}
                y2={H - PAD + 4}
                stroke="var(--foreground)"
                strokeWidth={1}
              />
              <text
                x={xFor(n)}
                y={H - PAD + 16}
                fontSize={11}
                fill="var(--foreground-muted)"
                textAnchor="middle"
                fontFamily="var(--font-rubik)"
              >
                {n}%
              </text>
            </g>
          ))}
          {[0, 25, 50, 75, 100].map((n) => (
            <g key={`y-${n}`}>
              <line
                x1={PAD - 4}
                y1={yFor(n)}
                x2={PAD}
                y2={yFor(n)}
                stroke="var(--foreground)"
                strokeWidth={1}
              />
              <text
                x={PAD - 8}
                y={yFor(n) + 3}
                fontSize={11}
                fill="var(--foreground-muted)"
                textAnchor="end"
                fontFamily="var(--font-rubik)"
              >
                {n}%
              </text>
            </g>
          ))}

          {/* Axis titles — Hebrew, RTL-friendly placement */}
          <text
            x={W / 2}
            y={H - 8}
            fontSize={12}
            fill="var(--foreground)"
            textAnchor="middle"
            fontWeight="bold"
            fontFamily="var(--font-rubik)"
          >
            השתתפות פעילה במליאה →
          </text>
          <text
            x={16}
            y={H / 2}
            fontSize={12}
            fill="var(--foreground)"
            textAnchor="middle"
            fontWeight="bold"
            fontFamily="var(--font-rubik)"
            transform={`rotate(-90 16 ${H / 2})`}
          >
            ← אחוז אמינות
          </text>

          {/* Quadrant labels — soft, in the corners */}
          <text x={xFor(75)} y={yFor(85)} fontSize={9.5} fill="var(--verdict-true)" textAnchor="middle" fontFamily="var(--font-rubik)" opacity={0.75}>
            אמין · פעיל
          </text>
          <text x={xFor(25)} y={yFor(85)} fontSize={9.5} fill="var(--foreground-muted)" textAnchor="middle" fontFamily="var(--font-rubik)" opacity={0.75}>
            אמין · לא נוכח
          </text>
          <text x={xFor(75)} y={yFor(15)} fontSize={9.5} fill="var(--verdict-false)" textAnchor="middle" fontFamily="var(--font-rubik)" opacity={0.75}>
            נוכח · מטעה
          </text>
          <text x={xFor(25)} y={yFor(15)} fontSize={9.5} fill="var(--foreground-muted)" textAnchor="middle" fontFamily="var(--font-rubik)" opacity={0.75}>
            לא נוכח · מטעה
          </text>

          {/* Data points */}
          {points.map((p) => {
            const isHovered = hovered?.politicianId === p.politicianId;
            return (
              <g key={p.politicianId}>
                <a href={`/politician/${p.politicianId}`} onMouseEnter={() => setHovered(p)} onMouseLeave={() => setHovered(null)}>
                  <circle
                    cx={xFor(p.attendancePct)}
                    cy={yFor(p.truthPct)}
                    r={isHovered ? 7 : 4.5}
                    fill={isHovered ? "var(--accent)" : "var(--foreground)"}
                    fillOpacity={isHovered ? 1 : 0.55}
                    stroke="var(--card)"
                    strokeWidth={1.5}
                    style={{ cursor: "pointer", transition: "all 120ms ease" }}
                  />
                </a>
              </g>
            );
          })}
        </svg>

        {/* Hover label — positioned absolutely so it doesn't reflow the SVG */}
        {hovered && (
          <div
            className="absolute top-3 left-3 bg-background border border-border-strong px-3 py-2 pointer-events-none"
            style={{ borderRadius: 2, maxWidth: "60%" }}
          >
            <div className="font-bold text-sm truncate">{hovered.name}</div>
            <div className="text-[11px] text-foreground-muted">{hovered.party}</div>
            <div className="text-[11px] tabular-nums mt-1">
              <span style={{ color: "var(--verdict-true)" }}>אמינות {Math.round(hovered.truthPct)}%</span>
              <span className="mx-1 opacity-40">·</span>
              <span>השתתפות {Math.round(hovered.attendancePct)}%</span>
              <span className="mx-1 opacity-40">·</span>
              <span className="text-foreground-muted">{hovered.totalClaims} טענות</span>
            </div>
          </div>
        )}
      </div>

      <p className="text-[11px] text-foreground-muted leading-relaxed mt-3">
        כל נקודה = פוליטיקאי. ציר X — אחוז ישיבות מליאה ב-90 ימים שבהן דיבר.
        ציר Y — אחוז אמינות לפי בדיקת העובדות. רחפו על נקודה לראות שם.
      </p>
    </div>
  );
}
