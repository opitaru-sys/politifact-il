/**
 * Specific past digest issue at /digest/[weekOf] (YYYY-MM-DD slug).
 * Same layout as /digest but always fetches the issue dated `weekOf`.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { DigestRenderer, type DigestSection } from "@/components/DigestRenderer";
import { buildDigestContext, digestSlug, parseDigestSlug } from "@/lib/digest-helpers";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ weekOf: string }>;
}): Promise<Metadata> {
  const { weekOf } = await params;
  const date = parseDigestSlug(weekOf);
  if (!date) return {};
  const digest = await prisma.digest.findUnique({
    where: { weekOf: date },
    select: { title: true, intro: true, status: true },
  });
  if (!digest || digest.status !== "published") return {};
  return {
    title: `${digest.title} | בדוק`,
    description: digest.intro,
  };
}

export default async function DigestIssuePage({
  params,
}: {
  params: Promise<{ weekOf: string }>;
}) {
  const { weekOf } = await params;
  const date = parseDigestSlug(weekOf);
  if (!date) notFound();

  const digest = await prisma.digest.findUnique({ where: { weekOf: date } });
  if (!digest || digest.status !== "published") notFound();

  const sections = (digest.sections ?? []) as unknown as DigestSection[];
  const { claimMap, topicMap } = await buildDigestContext(sections);

  // Find adjacent published issues for prev/next navigation.
  const [prev, next] = await Promise.all([
    prisma.digest.findFirst({
      where: { status: "published", weekOf: { lt: date } },
      orderBy: { weekOf: "desc" },
      select: { weekOf: true, title: true },
    }),
    prisma.digest.findFirst({
      where: { status: "published", weekOf: { gt: date } },
      orderBy: { weekOf: "asc" },
      select: { weekOf: true, title: true },
    }),
  ]);

  return (
    <div>
      <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-2">
        סיכום שבועי · {digest.weekOf.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}
      </div>
      <h1 className="text-4xl font-black mb-3 tracking-tight">{digest.title}</h1>
      <p className="text-sm text-foreground-muted mb-8 max-w-2xl leading-relaxed">
        {digest.intro}
      </p>

      <DigestRenderer sections={sections} claimMap={claimMap} topicMap={topicMap} />

      <nav className="pt-8 mt-10 border-t border-border flex items-center justify-between gap-4 text-sm">
        {prev ? (
          <Link href={`/digest/${digestSlug(prev.weekOf)}`} className="text-foreground-muted hover:text-foreground transition-colors">
            → סיכום קודם · {prev.weekOf.toLocaleDateString("he-IL", { day: "numeric", month: "short" })}
          </Link>
        ) : (
          <span />
        )}
        <Link href="/digest" className="font-bold hover:text-accent transition-colors">
          לסיכום האחרון
        </Link>
        {next ? (
          <Link href={`/digest/${digestSlug(next.weekOf)}`} className="text-foreground-muted hover:text-foreground transition-colors">
            סיכום הבא · {next.weekOf.toLocaleDateString("he-IL", { day: "numeric", month: "short" })} ←
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </div>
  );
}
