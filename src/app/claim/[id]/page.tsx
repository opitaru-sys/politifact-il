import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PoliticianAvatar } from "@/components/PoliticianAvatar";
import { VerdictBadge } from "@/components/VerdictBadge";
import { ReportButton } from "@/components/ReportButton";
import { CommentsSection } from "@/components/CommentsSection";
import { ShareButtons } from "@/components/ShareButtons";
import { shareTextForClaim } from "@/lib/share-text";
import { topicDisplayLabel } from "@/lib/topics";
import type { Verdict } from "@/data/mock";

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://bduk.co.il";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getClaim(id: string) {
  // Same filter as the public feed — unapproved / rejected claims return 404
  // instead of being deep-linkable.
  return prisma.claim.findFirst({
    where: { id, status: "published", editorApproved: true },
    include: {
      politician: true,
      _count: { select: { comments: true } },
    },
  });
}

function isSpecificUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, "");
    if (path.length < 2) return false;
    const segments = path.split("/").filter(Boolean);
    return segments.length >= 1 && (segments[segments.length - 1].length >= 4 || segments.length >= 2);
  } catch {
    return false;
  }
}

function formatLongDate(d: Date): string {
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" });
}

// Verdict copy in Hebrew for the ClaimReview JSON-LD `reviewRating` field.
// Google's recommended ratings vocabulary maps verdicts onto a 1-5 scale
// where 5 = true. We use the same mapping the homepage's verdict colors do.
const VERDICT_RATING: Record<Verdict, { value: number; alt: string }> = {
  true: { value: 5, alt: "אמת" },
  "half-true": { value: 3, alt: "חצי אמת" },
  false: { value: 1, alt: "שקר" },
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const c = await getClaim(id);
  if (!c) return {};
  const shortQuote = c.quote.length > 80 ? c.quote.slice(0, 77) + "..." : c.quote;
  return {
    title: `${c.politician.name}: ${shortQuote} | בדוק`,
    description: c.summary ?? `${c.politician.name}: "${shortQuote}" — פסק דין: ${c.verdict}.`,
  };
}

// Verification sources that users can search themselves. Used to be on every
// feed card; moved to the claim detail page where it earns its space.
const VERIFICATION_SOURCES: { label: string; url: string }[] = [
  { label: "הלמ\"ס", url: "https://www.cbs.gov.il" },
  { label: "בנק ישראל", url: "https://www.boi.org.il" },
  { label: "מבקר המדינה", url: "https://www.mevaker.gov.il" },
  { label: "כנסת ישראל", url: "https://main.knesset.gov.il" },
  { label: "ספר התקציב", url: "https://www.gov.il/he/departments/news/spokesman" },
];

export default async function ClaimPage({ params }: PageProps) {
  const { id } = await params;
  const c = await getClaim(id);
  if (!c) notFound();

  const verdict = c.verdict as Verdict;
  const rating = VERDICT_RATING[verdict];

  // Google ClaimReview structured data. Helps the page surface in fact-check
  // search results and gives downstream aggregators (Politifact-style
  // engines, browser fact-check extensions) a machine-readable verdict.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ClaimReview",
    datePublished: c.createdAt.toISOString().split("T")[0],
    url: `${SITE_URL}/claim/${c.id}`,
    claimReviewed: c.quote,
    itemReviewed: {
      "@type": "Claim",
      author: {
        "@type": "Person",
        name: c.politician.name,
        sameAs: `${SITE_URL}/politician/${c.politician.id}`,
      },
      datePublished: c.date.toISOString().split("T")[0],
      appearance: isSpecificUrl(c.sourceUrl)
        ? [{ "@type": "OpinionNewsArticle", url: c.sourceUrl, publisher: { "@type": "Organization", name: c.source } }]
        : undefined,
    },
    reviewRating: {
      "@type": "Rating",
      ratingValue: rating.value,
      bestRating: 5,
      worstRating: 1,
      alternateName: rating.alt,
    },
    author: {
      "@type": "Organization",
      name: "בדוק",
      url: SITE_URL,
    },
  };

  return (
    <article dir="rtl">
      {/* JSON-LD for Google ClaimReview. Rendered inline as a script tag so it
          ships with the SSR response and is indexable. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Breadcrumb / eyebrow */}
      <div className="text-[11px] tracking-[0.3em] uppercase text-foreground-muted mb-3 flex items-center gap-2 flex-wrap">
        <Link href="/" className="hover:text-foreground">דף הבית</Link>
        <span className="opacity-40">/</span>
        <Link href={`/politician/${c.politician.id}`} className="hover:text-foreground">{c.politician.name}</Link>
        <span className="opacity-40">/</span>
        <span className="text-accent font-bold">טענה</span>
      </div>

      {/* Header: politician identity + verdict + date. The first thing a
          reader needs to know is who said this, what we ruled, and when. */}
      <header className="mb-6 pb-6 border-b-[1.5px] border-border-strong">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <a href={`/politician/${c.politician.id}`} className="flex items-center gap-3 hover:opacity-80">
            <PoliticianAvatar
              id={c.politician.id}
              name={c.politician.name}
              image={c.politician.image}
              size="lg"
              priority
            />
            <div>
              <div className="text-2xl md:text-3xl font-black tracking-tight">{c.politician.name}</div>
              <div className="text-sm text-foreground-muted mt-1">
                {c.politician.party}
                {c.politician.role ? ` · ${c.politician.role}` : ""}
              </div>
            </div>
          </a>
          <div className="flex flex-col items-end gap-2">
            <VerdictBadge verdict={verdict} />
            <div className="text-[11px] uppercase tracking-wider text-foreground-muted">
              {formatLongDate(c.date)}
            </div>
          </div>
        </div>
      </header>

      {/* The quote — the heart of the page, set in large display type. */}
      <blockquote
        className="relative text-xl md:text-2xl font-bold leading-snug mb-6 pr-6 border-r-[3px] border-accent"
      >
        &ldquo;{c.quote}&rdquo;
      </blockquote>

      {/* TL;DR summary — promoted from the card's small caption to a callout. */}
      {c.summary && (
        <div
          className="bg-card border-r-[3px] border-foreground-muted/30 p-4 mb-8"
          style={{ borderRadius: 4 }}
        >
          <div className="text-[10px] uppercase tracking-[0.2em] text-foreground-muted font-bold mb-1.5">
            תקציר הבדיקה
          </div>
          <p className="text-base leading-relaxed">{c.summary}</p>
        </div>
      )}

      {/* Two-column layout on desktop: explanation on the right (RTL primary),
          metadata + actions on the left. Mobile collapses to single column. */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-8 mb-10">
        <div className="space-y-8 min-w-0">
          {/* Full explanation — this is the "evidence" portion of the page. */}
          <section>
            <h2 className="text-sm font-black tracking-[0.2em] uppercase mb-3 pb-2 border-b border-border-strong">
              ההסבר המלא
            </h2>
            <div className="prose prose-sm max-w-none text-foreground leading-relaxed whitespace-pre-wrap">
              {c.explanation}
            </div>
          </section>

          {/* Where it was said + what we checked it against. */}
          <section>
            <h2 className="text-sm font-black tracking-[0.2em] uppercase mb-3 pb-2 border-b border-border-strong">
              מקורות
            </h2>
            <dl className="space-y-3 text-sm">
              <div className="flex items-baseline gap-3">
                <dt className="text-[11px] uppercase tracking-wider text-foreground-muted font-bold w-28 shrink-0">
                  נאמר ב
                </dt>
                <dd>
                  {isSpecificUrl(c.sourceUrl) ? (
                    <a
                      href={c.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold underline decoration-1 underline-offset-2 hover:text-accent"
                    >
                      {c.source} ↗
                    </a>
                  ) : (
                    <span className="font-bold">{c.source}</span>
                  )}
                </dd>
              </div>
              {c.factSource && (
                <div className="flex items-baseline gap-3">
                  <dt className="text-[11px] uppercase tracking-wider text-foreground-muted font-bold w-28 shrink-0">
                    מקור הבדיקה
                  </dt>
                  <dd>
                    {isSpecificUrl(c.factSourceUrl) ? (
                      <a
                        href={c.factSourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold underline decoration-1 underline-offset-2 hover:text-accent"
                      >
                        {c.factSource} ↗
                      </a>
                    ) : (
                      <span className="font-bold">{c.factSource}</span>
                    )}
                  </dd>
                </div>
              )}
              <div className="flex items-baseline gap-3">
                <dt className="text-[11px] uppercase tracking-wider text-foreground-muted font-bold w-28 shrink-0">
                  נושא
                </dt>
                <dd>
                  <a
                    href={`/?topic=${encodeURIComponent(c.topic)}`}
                    className="text-foreground hover:text-accent underline decoration-1 underline-offset-2"
                    title={c.topic}
                  >
                    {topicDisplayLabel(c.topic)}
                  </a>
                </dd>
              </div>
            </dl>

            {/* User-driven verification — official sources the reader can
                cross-check the claim against. */}
            <div className="mt-5 pt-4 border-t border-border">
              <div className="text-[10px] uppercase tracking-[0.2em] text-foreground-muted font-bold mb-2">
                אמתו בעצמכם · מקורות רשמיים
              </div>
              <div className="flex flex-wrap gap-2">
                {VERIFICATION_SOURCES.map((s) => (
                  <a
                    key={s.url}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border border-border hover:border-accent hover:text-accent px-2.5 py-1 text-[11px] font-medium transition-colors"
                    style={{ borderRadius: 2 }}
                  >
                    {s.label} ↗
                  </a>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Sidebar: metadata + report CTA. On mobile this drops below. */}
        <aside className="space-y-5">
          <div
            className="bg-card border border-border p-4 text-sm"
            style={{ borderRadius: 4 }}
          >
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-foreground-muted font-bold mb-3">
              מטא-נתונים
            </h3>
            <dl className="space-y-2 text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-foreground-muted">תאריך הציטוט</dt>
                <dd className="font-bold tabular-nums">{formatShortDate(c.date)}</dd>
              </div>
              {c.verifiedAt && (
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-foreground-muted">תאריך הבדיקה</dt>
                  <dd className="font-bold tabular-nums">{formatShortDate(c.verifiedAt)}</dd>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-foreground-muted">סטטוס</dt>
                <dd className="font-bold">עבר בדיקה אוטומטית נוספת</dd>
              </div>
              {typeof c.confidence === "number" && c.confidence > 0 && (
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-foreground-muted">רמת ביטחון</dt>
                  <dd className="font-bold tabular-nums">{Math.round(c.confidence * 100)}%</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Correction CTA — promoted from a small text link to a real call-
              out, because reports are how this site stays honest. */}
          <div
            className="border-[1.5px] border-foreground-muted/40 p-4"
            style={{ borderRadius: 4 }}
          >
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-accent font-bold mb-2">
              מצאתם שגיאה?
            </h3>
            <p className="text-xs leading-relaxed mb-3 text-foreground-muted">
              ציטוט לא מדויק, פסק שגוי, מקור חסר? דיווחים נשמרים בתור בדיקה, ובמידת הצורך הטענה מתוקנת או מוסרת.
            </p>
            <ReportButton claimId={c.id} variant="prominent" />
          </div>

          <div className="text-xs text-foreground-muted leading-relaxed border-t border-border pt-4">
            <p className="mb-2">
              <strong className="text-foreground">איך זה נבדק?</strong>
            </p>
            <p>
              הטענה חולצה ממקור פומבי, נבדקה מול חיפוש Google חי לנתונים עדכניים,
              ועברה בדיקה אוטומטית שנייה לפני פרסום.{" "}
              <a href="/about" className="underline decoration-1 underline-offset-2 hover:text-accent">
                המתודולוגיה המלאה →
              </a>
            </p>
          </div>
        </aside>
      </div>

      {/* Share row */}
      <div className="border-t border-border pt-4 mb-10 flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[10px] uppercase tracking-[0.2em] text-foreground-muted font-bold">
          שתפו את הטענה
        </span>
        <ShareButtons
          text={shareTextForClaim(c.politician.name, c.verdict as Verdict, c.quote)}
          url={`${SITE_URL}/claim/${c.id}`}
        />
      </div>

      {/* Comments collapsed below the fold — discussion happens here but it's
          not the main content of an evidence page. */}
      <section className="border-t-[1.5px] border-border-strong pt-6">
        <CommentsSection claimId={c.id} initialCount={c._count.comments} />
      </section>

      {/* Footer navigation */}
      <div className="mt-12 pt-6 border-t border-border flex items-center gap-3 text-[11px] tracking-wider uppercase text-foreground-muted flex-wrap">
        <Link href={`/politician/${c.politician.id}`} className="hover:text-accent font-bold">
          ← כל הטענות של {c.politician.name}
        </Link>
        <span className="opacity-50">·</span>
        <Link href="/" className="hover:text-accent font-bold">
          ← דף הבית
        </Link>
      </div>
    </article>
  );
}
