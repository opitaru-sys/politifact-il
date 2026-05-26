/**
 * Home-page teaser for the latest published weekly digest. Shows the
 * digest title + 2-3 lead insights (heading + brief body), with a
 * clear CTA to read the full issue at /digest.
 *
 * Designed to feel magazine-y, not dashboardy: this is the editorial
 * lede on the home page now that the BiggestMovers card was retired
 * for being "boring data". The journalist-voice insights ARE the
 * interesting thing — surface them with weight.
 *
 * Hides gracefully (returns null) when no digest has been published
 * yet. The home page wraps the call so layout isn't affected.
 */
import Link from "next/link";
import { prisma } from "@/lib/db";
import { type DigestSection } from "./DigestRenderer";
import { unmarkPoliticians, tokenizeInsight } from "@/lib/insight-markup";

const MAX_INSIGHTS = 3;
/** Trim long insight bodies on the teaser so the card doesn't become
 *  a wall of text. Full body lives at /digest. */
const BODY_TEASER_CHARS = 220;

export async function DigestHighlights() {
  const latest = await prisma.digest.findFirst({
    where: { status: "published" },
    orderBy: { weekOf: "desc" },
  });
  if (!latest) return null;

  const sections = (latest.sections ?? []) as unknown as DigestSection[];
  const insights = sections
    .filter((s) => s.type === "insight" && s.heading && s.body)
    .slice(0, MAX_INSIGHTS);
  if (insights.length === 0) return null;

  const dateLabel = latest.weekOf.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <section
      className="bg-card border-[1.5px] border-border-strong overflow-hidden"
      style={{ borderRadius: 4 }}
    >
      <div className="px-6 py-5 border-b border-border">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
          <span className="text-[10px] tracking-[0.3em] uppercase font-bold text-accent">
            סיכום השבוע · {dateLabel}
          </span>
          <Link
            href="/digest"
            className="text-[11px] tracking-wider uppercase text-accent hover:text-accent-dark font-bold"
          >
            הסיכום המלא ←
          </Link>
        </div>
        <Link
          href="/digest"
          className="block hover:text-accent-dark transition-colors"
        >
          <h2 className="text-2xl md:text-3xl font-black tracking-tight leading-tight">
            {latest.title}
          </h2>
        </Link>
      </div>

      <ul className="divide-y divide-border">
        {insights.map((ins, i) => (
          <li key={i} className="px-6 py-4">
            <h3 className="font-black text-sm tracking-tight mb-1.5">{ins.heading}</h3>
            <p className="text-[13px] text-foreground-muted leading-relaxed">
              {teaseBody(ins.body)}
            </p>
          </li>
        ))}
      </ul>

      <div className="px-6 py-3 bg-muted/30 border-t border-border">
        <Link
          href="/digest"
          className="text-[12px] font-bold text-foreground hover:text-accent transition-colors"
        >
          קרא את הסיכום השבועי המלא ←
        </Link>
      </div>
    </section>
  );
}

/**
 * Strip politician-name markers (no links inside teaser — saves the
 * "wait, that's clickable too?" friction; full hyperlinked body is
 * on /digest), then truncate at a clean word boundary.
 */
function teaseBody(body: string): string {
  // Strip markers down to plain text. We don't use the tokenizer-to-
  // React version here because the teaser is server-rendered plain
  // text. unmarkPoliticians is the shorter route.
  void tokenizeInsight; // imported for callers; intentional no-op here.
  const plain = unmarkPoliticians(body).replace(/\s+/g, " ").trim();
  if (plain.length <= BODY_TEASER_CHARS) return plain;
  const truncated = plain.slice(0, BODY_TEASER_CHARS);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 80 ? truncated.slice(0, lastSpace) : truncated) + "…";
}
