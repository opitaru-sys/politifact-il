/**
 * Latest published weekly digest. The home page links here as
 * "השבוע באמינות". Past issues are listed at the bottom and live at
 * their own URLs (/digest/[weekOf]).
 *
 * If no digest has been published yet, shows a "coming soon" stub
 * with a link to /about. We don't want the link from the home page
 * to lead to a 404 while the editor warms up the workflow.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { DigestRenderer, type DigestSection } from "@/components/DigestRenderer";
import { buildDigestContext, digestSlug } from "@/lib/digest-helpers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "השבוע באמינות | בדוק",
  description:
    "סיכום שבועי של מה שקרה בעולם בדיקת העובדות הפוליטיות בישראל: מי עלה ומי ירד באמינות, הטענה השקרית הבולטת, והנושא שלא ירד מהכותרות.",
};

const ARCHIVE_LIMIT = 12;

export default async function DigestPage() {
  const [latest, archive] = await Promise.all([
    prisma.digest.findFirst({
      where: { status: "published" },
      orderBy: { weekOf: "desc" },
    }),
    prisma.digest.findMany({
      where: { status: "published" },
      orderBy: { weekOf: "desc" },
      skip: 1,
      take: ARCHIVE_LIMIT,
      select: { id: true, weekOf: true, title: true },
    }),
  ]);

  if (!latest) {
    return (
      <div>
        <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-2">
          בקרוב
        </div>
        <h1 className="text-4xl font-black mb-4 tracking-tight">השבוע באמינות</h1>
        <p className="text-sm text-foreground-muted max-w-2xl leading-relaxed mb-6">
          הסיכום השבועי האוטומטי טרם פורסם. הוא יעלה כאן ברגע שהעורך יאשר את הטיוטה הראשונה.
        </p>
        <Link
          href="/about"
          className="text-[11px] tracking-wider uppercase text-accent hover:text-accent-dark font-bold"
        >
          איך עובד הסיכום השבועי? ←
        </Link>
      </div>
    );
  }

  const sections = (latest.sections ?? []) as unknown as DigestSection[];
  const { claimMap, topicMap } = await buildDigestContext(sections);

  return (
    <div>
      <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-2">
        סיכום שבועי · {latest.weekOf.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}
      </div>
      <h1 className="text-4xl font-black mb-3 tracking-tight">{latest.title}</h1>
      <p className="text-sm text-foreground-muted mb-8 max-w-2xl leading-relaxed">
        {latest.intro}
      </p>

      <DigestRenderer sections={sections} claimMap={claimMap} topicMap={topicMap} />

      {archive.length > 0 && (
        <section className="pt-10 mt-10 border-t border-border">
          <div className="text-[11px] uppercase tracking-wider text-foreground-muted font-bold mb-3">
            סיכומים קודמים
          </div>
          <ul className="space-y-2">
            {archive.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/digest/${digestSlug(a.weekOf)}`}
                  className="text-sm hover:text-accent transition-colors"
                >
                  <span className="tabular-nums text-foreground-muted ml-2">
                    {a.weekOf.toLocaleDateString("he-IL", { day: "numeric", month: "long" })}
                  </span>
                  — {a.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
