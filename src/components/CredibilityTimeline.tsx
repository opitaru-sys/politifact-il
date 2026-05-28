"use client";

/**
 * Custom SVG line chart for a politician's credibility over time.
 * Data is fetched server-side (CredibilitySnapshot rows) and passed as
 * a prop; this component just renders + handles the 3/6/12 month
 * selector + hover tooltip.
 *
 * Why custom SVG over a chart library:
 *  - The whole site is ~bare React + Tailwind; no chart deps yet.
 *  - One line chart with a tooltip is ~150 lines of SVG. Recharts is
 *    ~70KB gzipped; we render 200 lines for this and ship 0 KB extra.
 *  - RTL-aware time axis is easier to control directly (oldest on right,
 *    newest on left — matches Hebrew reading direction).
 *
 * Color rule (per spec):
 *  - green if (last visible point - first visible point) > +2
 *  - red   if (last - first) < -2
 *  - grey  otherwise (flat is not a story)
 */
import { useMemo, useState } from "react";

export interface TimelinePoint {
  asOf: string; // ISO date string (Date is not serializable across server→client)
  totalClaims: number;
  truthPercentage: number;
  credibilityScore: number;
}

interface Props {
  points: TimelinePoint[];
  /** Minimum sample size below which a point is rendered as a gap. */
  minSample?: number;
}

type WindowMonths = 3 | 6 | 12;

const FLAT_THRESHOLD = 2; // delta within ±2 points = "flat" (grey line)

export function CredibilityTimeline({ points, minSample = 5 }: Props) {
  const [monthsBack, setMonthsBack] = useState<WindowMonths>(6);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Filter points to the active window.
  const filtered = useMemo(() => {
    if (points.length === 0) return [];
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - monthsBack);
    return points.filter((p) => new Date(p.asOf).getTime() >= cutoff.getTime());
  }, [points, monthsBack]);

  // Net change over the visible window — used for line color + the footer.
  const { netChange, lineColor } = useMemo(() => {
    const eligible = filtered.filter((p) => p.totalClaims >= minSample);
    if (eligible.length < 2) {
      return { netChange: null as number | null, lineColor: "var(--foreground-muted)" };
    }
    const change = eligible[eligible.length - 1].credibilityScore - eligible[0].credibilityScore;
    let color = "var(--foreground-muted)";
    if (change > FLAT_THRESHOLD) color = "var(--verdict-true)";
    else if (change < -FLAT_THRESHOLD) color = "var(--verdict-false)";
    return { netChange: change, lineColor: color };
  }, [filtered, minSample]);

  if (points.length === 0) {
    return (
      <div
        className="bg-card border border-border-strong p-6 text-center text-foreground-muted text-sm"
        style={{ borderRadius: 4 }}
      >
        טרם נצברו מספיק נתונים להצגת מגמת דיוק.
      </div>
    );
  }

  return (
    <div
      className="bg-card border border-border-strong overflow-hidden"
      style={{ borderRadius: 4 }}
    >
      <div className="px-5 py-3.5 border-b border-border flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-black text-base tracking-tight">ציון דיוק עובדתי לאורך זמן</h2>
          <div className="text-[10px] uppercase tracking-wider text-foreground-muted mt-0.5">
            חלון נע · 30 ימים · עדכון יומי
          </div>
        </div>
        <div className="flex items-center gap-1 text-[11px] font-bold">
          {([3, 6, 12] as WindowMonths[]).map((m) => (
            <button
              key={m}
              onClick={() => setMonthsBack(m)}
              className={`px-2.5 py-1 transition-colors ${
                monthsBack === m
                  ? "bg-foreground text-background"
                  : "text-foreground-muted hover:text-foreground"
              }`}
              style={{ borderRadius: 2 }}
            >
              {m} חודשים
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 py-5">
        <Chart points={filtered} minSample={minSample} lineColor={lineColor} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} />
        {netChange !== null && (
          <div className="text-[11px] text-foreground-muted text-center mt-3">
            שינוי ב-{monthsBack} חודשים:{" "}
            <span
              className="font-black tabular-nums"
              style={{
                color: Math.abs(netChange) <= FLAT_THRESHOLD
                  ? "var(--foreground-muted)"
                  : netChange > 0
                  ? "var(--verdict-true)"
                  : "var(--verdict-false)",
              }}
            >
              {netChange > 0 ? "+" : ""}{netChange.toFixed(1)} נקודות
            </span>
          </div>
        )}
        {netChange === null && (
          <div className="text-[11px] text-foreground-muted text-center mt-3">
            לא מספיק נקודות מדגם בחלון הזה להציג מגמה.
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The actual SVG chart. RTL: oldest date on the right, newest on the left,
 * matching Hebrew reading order. Y axis fixed at 0-100 so visual scale is
 * comparable across politicians.
 */
function Chart({
  points,
  minSample,
  lineColor,
  hoverIdx,
  setHoverIdx,
}: {
  points: TimelinePoint[];
  minSample: number;
  lineColor: string;
  hoverIdx: number | null;
  setHoverIdx: (i: number | null) => void;
}) {
  const W = 600;
  const H = 220;
  const PAD = { top: 18, right: 14, bottom: 26, left: 30 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  if (points.length === 0) {
    return (
      <div className="h-[220px] flex items-center justify-center text-foreground-muted text-xs">
        אין נתונים בחלון הזה.
      </div>
    );
  }

  const minTime = new Date(points[0].asOf).getTime();
  const maxTime = new Date(points[points.length - 1].asOf).getTime();
  const timeSpan = maxTime - minTime || 1; // avoid /0 when there's only one point

  // RTL X: oldest → right, newest → left.
  const xFor = (asOf: string) => {
    const t = new Date(asOf).getTime();
    const frac = (t - minTime) / timeSpan;
    return PAD.left + (1 - frac) * innerW;
  };
  const yFor = (score: number) => PAD.top + (1 - score / 100) * innerH;

  // Build line segments, breaking at low-sample gaps so we don't draw
  // a misleading interpolation through holes in the data.
  type Segment = { d: string };
  const segments: Segment[] = [];
  let buf: TimelinePoint[] = [];
  for (const p of points) {
    if (p.totalClaims < minSample) {
      if (buf.length >= 2) segments.push({ d: toPath(buf, xFor, yFor) });
      buf = [];
    } else {
      buf.push(p);
    }
  }
  if (buf.length >= 2) segments.push({ d: toPath(buf, xFor, yFor) });

  // Y-axis gridlines at 0, 25, 50, 75, 100.
  const gridYs = [0, 25, 50, 75, 100];

  // X-axis ticks: 4 evenly-spaced dates.
  const tickCount = 4;
  const xTicks: { x: number; label: string }[] = [];
  for (let i = 0; i < tickCount; i++) {
    const frac = i / (tickCount - 1);
    const t = minTime + frac * timeSpan;
    xTicks.push({
      x: PAD.left + (1 - frac) * innerW,
      label: new Date(t).toLocaleDateString("he-IL", { month: "short", year: "2-digit" }),
    });
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
        {/* Y gridlines + labels */}
        {gridYs.map((g) => (
          <g key={g}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yFor(g)}
              y2={yFor(g)}
              stroke="var(--border)"
              strokeWidth="0.5"
              strokeDasharray="2 3"
            />
            <text
              x={PAD.left - 6}
              y={yFor(g) + 3}
              textAnchor="end"
              fontSize="9"
              fill="var(--foreground-muted)"
            >
              {g}
            </text>
          </g>
        ))}

        {/* Reference band at 40-60 (the "ambiguous" credibility zone) */}
        <rect
          x={PAD.left}
          y={yFor(60)}
          width={innerW}
          height={yFor(40) - yFor(60)}
          fill="var(--verdict-half-bg, var(--border))"
          opacity="0.25"
        />

        {/* X-axis baseline */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={H - PAD.bottom}
          y2={H - PAD.bottom}
          stroke="var(--border-strong)"
          strokeWidth="1"
        />

        {/* X tick labels */}
        {xTicks.map((t, i) => (
          <text
            key={i}
            x={t.x}
            y={H - PAD.bottom + 14}
            textAnchor="middle"
            fontSize="9"
            fill="var(--foreground-muted)"
          >
            {t.label}
          </text>
        ))}

        {/* Line segments (broken across low-sample gaps) */}
        {segments.map((s, i) => (
          <path key={i} d={s.d} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ))}

        {/* Dots — show on all eligible points + invisible hit-area for hover */}
        {points.map((p, i) => {
          if (p.totalClaims < minSample) return null;
          const x = xFor(p.asOf);
          const y = yFor(p.credibilityScore);
          const isLast = i === points.length - 1;
          const isHover = hoverIdx === i;
          return (
            <g key={i}>
              <circle
                cx={x}
                cy={y}
                r={isLast || isHover ? 4 : 2.5}
                fill={
                  isLast
                    ? p.credibilityScore < 40
                      ? "var(--verdict-false)"
                      : p.credibilityScore < 60
                      ? "var(--verdict-half)"
                      : "var(--verdict-true)"
                    : lineColor
                }
                stroke="var(--card)"
                strokeWidth={isLast || isHover ? 1.5 : 0}
              />
              {/* Larger invisible hit area for hover */}
              <circle
                cx={x}
                cy={y}
                r={12}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                style={{ cursor: "pointer" }}
              />
            </g>
          );
        })}
      </svg>

      {/* Tooltip overlay rendered in DOM (easier than SVG <foreignObject>) */}
      {hoverIdx !== null && points[hoverIdx] && (
        <Tooltip point={points[hoverIdx]} x={xFor(points[hoverIdx].asOf)} y={yFor(points[hoverIdx].credibilityScore)} svgW={W} svgH={H} />
      )}
    </div>
  );
}

function toPath(
  pts: TimelinePoint[],
  xFor: (s: string) => number,
  yFor: (n: number) => number,
): string {
  return pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(p.asOf).toFixed(2)} ${yFor(p.credibilityScore).toFixed(2)}`)
    .join(" ");
}

function Tooltip({
  point,
  x,
  y,
  svgW,
  svgH,
}: {
  point: TimelinePoint;
  x: number;
  y: number;
  svgW: number;
  svgH: number;
}) {
  // Position in % so it survives the SVG's responsive scaling.
  const xPct = (x / svgW) * 100;
  const yPct = (y / svgH) * 100;
  return (
    <div
      className="absolute pointer-events-none bg-foreground text-background text-[10px] px-2 py-1.5 leading-tight"
      style={{
        left: `${xPct}%`,
        top: `${yPct}%`,
        transform: "translate(-50%, calc(-100% - 8px))",
        borderRadius: 2,
        whiteSpace: "nowrap",
      }}
    >
      <div className="font-bold tabular-nums">
        {new Date(point.asOf).toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "2-digit" })}
      </div>
      <div className="tabular-nums opacity-90">
        ציון: {point.credibilityScore}% · גולמי: {point.truthPercentage}% · {point.totalClaims} טענות
      </div>
    </div>
  );
}
