/**
 * Renders a Digest's sections array as a stack of styled cards.
 * Shared between /digest (latest published) and /digest/[weekOf]
 * (specific past issue), and also used inside /admin/digest as a
 * live preview.
 *
 * Section types must stay in sync with what generate-weekly-digest.mts
 * produces. New section types are additive — old issues with unknown
 * types fall through to a plain text card.
 */
import Link from "next/link";
import { PoliticianAvatar } from "./PoliticianAvatar";
import { VerdictBadge } from "./VerdictBadge";

interface MoverItem {
  politicianId: string;
  politicianName: string;
  party: string;
  image: string | null;
  delta: number;
  currentScore: number;
  previousScore: number;
}

export interface DigestSection {
  type: string;
  heading: string;
  body: string;
  items?: MoverItem[];
  claimId?: string;
  topicSlug?: string;
}

interface Props {
  sections: DigestSection[];
  /** Pre-fetched lookups so the renderer doesn't have to do its own DB
   *  queries for claim / topic context. */
  claimMap?: Map<
    string,
    {
      id: string;
      quote: string;
      verdict: string;
      summary: string | null;
      politicianName: string;
      politicianId: string;
      politicianImage: string | null;
      party: string;
    }
  >;
  topicMap?: Map<string, string>; // slug → label
}

export function DigestRenderer({ sections, claimMap, topicMap }: Props) {
  return (
    <div className="space-y-6">
      {sections.map((s, i) => (
        <DigestSectionCard key={i} section={s} claimMap={claimMap} topicMap={topicMap} />
      ))}
    </div>
  );
}

function DigestSectionCard({
  section,
  claimMap,
  topicMap,
}: {
  section: DigestSection;
  claimMap?: Props["claimMap"];
  topicMap?: Props["topicMap"];
}) {
  const isInsight = section.type === "insight";
  return (
    <section
      className="bg-card border border-border-strong overflow-hidden"
      style={{ borderRadius: 4 }}
    >
      <div className="px-5 py-3.5 border-b border-border">
        <h2 className="font-black text-base tracking-tight">{section.heading}</h2>
      </div>
      <div className="p-5 space-y-4">
        {section.body && isInsight ? (
          // Insight bodies are journalist-voice paragraphs. Allow
          // multi-paragraph splitting so the AI can write more than one
          // beat when the observation deserves it.
          <div className="space-y-3 text-[15px] text-foreground leading-[1.7]">
            {section.body.split(/\n{2,}/).map((para, i) => (
              <p key={i}>{para.trim()}</p>
            ))}
          </div>
        ) : section.body ? (
          <p className="text-sm text-foreground leading-relaxed">{section.body}</p>
        ) : null}

        {section.type === "movers" && section.items && section.items.length > 0 && (
          <MoversList items={section.items} />
        )}

        {/* "claim" section type is no longer emitted by the generator
            (dropped during the 2026-05-26 reshape: "biggest false claim
            of the week" was subjective and uninteresting). Kept here
            for backward compatibility with older digest issues. */}
        {section.type === "claim" && section.claimId && (
          <ClaimRef claimId={section.claimId} claimMap={claimMap} />
        )}

        {section.type === "topic" && section.topicSlug && (
          <TopicRef slug={section.topicSlug} topicMap={topicMap} />
        )}
      </div>
    </section>
  );
}

function MoversList({ items }: { items: MoverItem[] }) {
  const gainers = items.filter((i) => i.delta > 0).sort((a, b) => b.delta - a.delta);
  const losers = items.filter((i) => i.delta < 0).sort((a, b) => a.delta - b.delta);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <MoverColumn title="עלו" tone="positive" items={gainers} />
      <MoverColumn title="ירדו" tone="negative" items={losers} />
    </div>
  );
}

function MoverColumn({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "positive" | "negative";
  items: MoverItem[];
}) {
  const accent = tone === "positive" ? "var(--verdict-true)" : "var(--verdict-false)";
  const arrow = tone === "positive" ? "↑" : "↓";
  return (
    <div className="border border-border" style={{ borderRadius: 4 }}>
      <div
        className="px-4 py-2 text-[10px] uppercase tracking-wider font-bold border-b border-border bg-muted/30"
        style={{ color: accent }}
      >
        {title}
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-5 text-center text-[12px] text-foreground-muted">
          אין שינויים משמעותיים
        </div>
      ) : (
        <ol>
          {items.map((m) => {
            const sign = m.delta > 0 ? "+" : "";
            return (
              <li key={m.politicianId} className="border-b border-border last:border-b-0">
                <Link
                  href={`/politician/${m.politicianId}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors"
                >
                  <PoliticianAvatar
                    id={m.politicianId}
                    name={m.politicianName}
                    image={m.image}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{m.politicianName}</div>
                    <div className="text-[11px] text-foreground-muted truncate">{m.party}</div>
                  </div>
                  <div className="text-left shrink-0">
                    <div
                      className="font-black text-sm tabular-nums leading-none"
                      style={{ color: accent }}
                    >
                      {arrow} {sign}{m.delta.toFixed(1)}
                    </div>
                    <div className="text-[10px] tabular-nums text-foreground-muted mt-0.5">
                      ציון: {m.currentScore}%
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

function ClaimRef({
  claimId,
  claimMap,
}: {
  claimId: string;
  claimMap?: Props["claimMap"];
}) {
  const c = claimMap?.get(claimId);
  if (!c) {
    return (
      <div className="text-[12px] text-foreground-muted italic">
        (הטענה אינה זמינה — ייתכן שהוסרה לאחר פרסום הסיכום.)
      </div>
    );
  }
  return (
    <Link
      href={`/claim/${c.id}`}
      className="block border border-border p-4 hover:bg-muted/40 transition-colors"
      style={{ borderRadius: 4 }}
    >
      <div className="flex items-center gap-3 mb-3">
        <PoliticianAvatar
          id={c.politicianId}
          name={c.politicianName}
          image={c.politicianImage}
          size="sm"
        />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate">{c.politicianName}</div>
          <div className="text-[11px] text-foreground-muted truncate">{c.party}</div>
        </div>
        <VerdictBadge verdict={c.verdict as "true" | "half-true" | "false"} />
      </div>
      <blockquote className="text-sm leading-relaxed pr-3 border-r-2 border-border-strong italic">
        “{c.quote}”
      </blockquote>
      {c.summary && (
        <p className="text-[12px] text-foreground-muted mt-3 leading-relaxed">{c.summary}</p>
      )}
      <div className="text-[11px] text-accent mt-3">← קרא את הבדיקה המלאה</div>
    </Link>
  );
}

function TopicRef({
  slug,
  topicMap,
}: {
  slug: string;
  topicMap?: Props["topicMap"];
}) {
  const label = topicMap?.get(slug) ?? slug;
  return (
    <Link
      href={`/topic/${slug}`}
      className="inline-flex items-center gap-2 px-3 py-2 bg-accent text-background font-bold text-sm hover:bg-accent-dark transition-colors"
      style={{ borderRadius: 2 }}
    >
      פתח דף נושא: {label} ←
    </Link>
  );
}
