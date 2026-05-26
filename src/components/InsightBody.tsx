/**
 * Renders an insight body with `{{P:id|name}}` markers expanded to
 * hyperlinks. Multi-paragraph support via blank-line splitting.
 *
 * Used by DigestRenderer (insight section type), TopicBreakdown
 * (insight header), and the topic page insights band. One renderer,
 * one styling rule for politician hyperlinks across the site.
 */
import Link from "next/link";
import { tokenizeInsight } from "@/lib/insight-markup";

export function InsightBody({
  body,
  paragraphClassName,
}: {
  body: string;
  /** Optional override for the paragraph styling — defaults to the
   *  journalism-friendly 15px / 1.7 line-height the digest uses. */
  paragraphClassName?: string;
}) {
  const paraClass =
    paragraphClassName ?? "text-[15px] text-foreground leading-[1.7]";
  return (
    <div className="space-y-3">
      {body.split(/\n{2,}/).map((para, i) => {
        const tokens = tokenizeInsight(para.trim());
        return (
          <p key={i} className={paraClass}>
            {tokens.map((t, j) =>
              t.type === "text" ? (
                <span key={j}>{t.value}</span>
              ) : (
                <Link
                  key={j}
                  href={`/politician/${t.id}`}
                  className="underline decoration-[1.5px] underline-offset-2 hover:text-accent transition-colors font-semibold"
                >
                  {t.name}
                </Link>
              ),
            )}
          </p>
        );
      })}
    </div>
  );
}
