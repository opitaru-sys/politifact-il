import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ClaimCard } from "@/components/ClaimCard";
import type { Verdict } from "@/data/mock";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getClaim(id: string) {
  return prisma.claim.findUnique({
    where: { id },
    include: {
      politician: true,
      _count: { select: { comments: true } },
    },
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const c = await getClaim(id);
  if (!c) return {};
  const shortQuote = c.quote.length > 80 ? c.quote.slice(0, 77) + "..." : c.quote;
  return {
    title: `${c.politician.name} | בדוק`,
    description: `"${shortQuote}" — פסק דין: ${c.verdict}. ${c.summary ?? ""}`,
  };
}

export default async function ClaimPage({ params }: PageProps) {
  const { id } = await params;
  const c = await getClaim(id);
  if (!c) notFound();

  const claim = {
    id: c.id,
    politicianId: c.politicianId,
    quote: c.quote,
    verdict: c.verdict as Verdict,
    summary: c.summary,
    explanation: c.explanation,
    source: c.source,
    sourceUrl: c.sourceUrl,
    factSource: c.factSource,
    factSourceUrl: c.factSourceUrl,
    editorApproved: c.editorApproved,
    verifierNotes: c.verifierNotes,
    date: c.date.toISOString().split("T")[0],
    topic: c.topic,
    _politician: {
      id: c.politician.id,
      name: c.politician.name,
      party: c.politician.party,
      image: c.politician.image,
    },
    _commentCount: c._count.comments,
  };

  return (
    <div>
      <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-3">
        טענה בודדת · {c.topic}
      </div>
      <h1 className="text-2xl md:text-3xl font-black tracking-tight mb-6 max-w-3xl">
        טענה של {c.politician.name}
      </h1>

      <ClaimCard claim={claim} />

      <div className="mt-8 flex items-center gap-3 text-[11px] tracking-wider uppercase text-foreground-muted">
        <a
          href={`/politician/${c.politicianId}`}
          className="hover:text-accent font-bold"
        >
          ← כל הטענות של {c.politician.name}
        </a>
        <span className="opacity-50">·</span>
        <a href="/" className="hover:text-accent font-bold">
          ← דף הבית
        </a>
      </div>
    </div>
  );
}
