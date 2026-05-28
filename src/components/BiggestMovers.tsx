/**
 * Home-page card surfacing the biggest credibility movers in the last
 * 7 days (current vs. 7-days-ago snapshot, both windows = 30-day
 * rolling Wilson). Minimum sample of 15 claims in BOTH windows to be
 * eligible — below that, the delta is noise.
 *
 * Two columns: gainers (right, RTL leading) + losers (left). Hidden
 * entirely if there aren't at least a handful of movers — the card
 * needs to feel substantive, an empty side reads like a bug.
 *
 * Server component. Data pre-baked by the nightly snapshot cron;
 * read is a single DB query (see getBiggestMovers in cred-history.ts).
 */
import Link from "next/link";
import type { PoliticianMover } from "@/lib/cred-history";
import { PoliticianAvatar } from "./PoliticianAvatar";
import { ShareButtons } from "./ShareButtons";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://bduk.co.il";

function scoreColor(pct: number): string {
  if (pct < 40) return "var(--verdict-false)";
  if (pct < 60) return "var(--verdict-half)";
  return "var(--verdict-true)";
}

interface Props {
  gainers: PoliticianMover[];
  losers: PoliticianMover[];
  daysBack?: number;
}

export function BiggestMovers({ gainers, losers, daysBack = 7 }: Props) {
  // Hide the card entirely if we don't have enough story. Two movers
  // total reads more like a single-cell oddity than a "biggest movers"
  // story; below 4 we'd rather show nothing.
  if (gainers.length + losers.length < 4) return null;

  const caption = daysBack === 7
    ? "7 ימים אחרונים"
    : daysBack === 30
    ? "30 ימים אחרונים"
    : `${daysBack} ימים אחרונים`;

  // Build share text. The biggest mover (either gainer or loser) leads.
  const topGain = gainers[0];
  const topLoss = losers[0];
  const shareLines: string[] = [`השינוי הגדול בדיוק · ${caption}`];
  if (topGain) shareLines.push(`↑ ${topGain.politician.name} +${topGain.delta.toFixed(1)}`);
  if (topLoss) shareLines.push(`↓ ${topLoss.politician.name} ${topLoss.delta.toFixed(1)}`);
  const shareText = shareLines.join("\n");

  return (
    <section
      className="bg-card border border-border-strong overflow-hidden"
      style={{ borderRadius: 4 }}
    >
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-base tracking-tight">השינוי הגדול בדיוק</h2>
          <div className="text-[10px] uppercase tracking-wider text-foreground-muted mt-0.5">
            {caption} · מבוסס על חלון נע של 30 ימים
          </div>
        </div>
        <ShareButtons text={shareText} url={SITE_URL} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
        <MoversColumn
          title="עלו"
          arrow="↑"
          arrowColor="var(--verdict-true)"
          movers={gainers}
          emptyLabel="אין עליות משמעותיות"
        />
        <MoversColumn
          title="ירדו"
          arrow="↓"
          arrowColor="var(--verdict-false)"
          movers={losers}
          emptyLabel="אין ירידות משמעותיות"
        />
      </div>
    </section>
  );
}

function MoversColumn({
  title,
  arrow,
  arrowColor,
  movers,
  emptyLabel,
}: {
  title: string;
  arrow: string;
  arrowColor: string;
  movers: PoliticianMover[];
  emptyLabel: string;
}) {
  return (
    <div>
      <div className="px-5 py-2.5 text-[10px] uppercase tracking-wider font-bold text-foreground-muted bg-muted/30 border-b border-border">
        {title}
      </div>
      {movers.length === 0 ? (
        <div className="px-5 py-6 text-center text-[12px] text-foreground-muted">
          {emptyLabel}
        </div>
      ) : (
        <ol>
          {movers.map((m) => {
            const sign = m.delta >= 0 ? "+" : "";
            return (
              <li key={m.politician.id} className="border-b border-border last:border-b-0">
                <Link
                  href={`/politician/${m.politician.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition-colors"
                >
                  <PoliticianAvatar
                    id={m.politician.id}
                    name={m.politician.name}
                    image={m.politician.image}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{m.politician.name}</div>
                    <div className="text-[11px] text-foreground-muted truncate">{m.politician.party}</div>
                  </div>
                  <div className="text-left shrink-0">
                    <div
                      className="font-black text-base tabular-nums leading-none"
                      style={{ color: arrowColor }}
                      title={`קודם: ${m.previousScore}% (${m.previousSample} טענות) · עכשיו: ${m.currentScore}% (${m.currentSample} טענות)`}
                    >
                      <span className="text-sm ml-0.5">{arrow}</span>
                      {sign}{m.delta.toFixed(1)}
                    </div>
                    <div className="text-[10px] tabular-nums text-foreground-muted mt-0.5">
                      ציון עכשיו: {m.currentScore}%
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
