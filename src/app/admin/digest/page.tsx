/**
 * Admin UI for managing weekly digests. Lists all issues (draft +
 * published), lets the editor tweak the title/intro/sections JSON
 * produced by the generator script, then flip status to "published".
 *
 * Auth: cookie-based, set via /admin/login. Server actions validate
 * the same cookie. See src/lib/admin-auth.ts.
 *
 * The sections editor is a JSON textarea — power-user but adequate for
 * v1. The generator script produces structured drafts; the editor
 * usually just tweaks copy + maybe swaps a featured claim. A per-
 * section UI is a v2 improvement once we know the patterns.
 */
import { prisma } from "@/lib/db";
import { updateDigest, publishDigest, unpublishDigest, deleteDigest } from "./_actions";
import { buildDigestContext, digestSlug } from "@/lib/digest-helpers";
import { DigestRenderer, type DigestSection } from "@/components/DigestRenderer";
import { AdminNav } from "@/components/AdminNav";
import { bootstrapLegacyKey, requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ key?: string }>;
}

export default async function AdminDigestPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  await bootstrapLegacyKey(sp, "/admin/digest");
  await requireAdmin();

  const digests = await prisma.digest.findMany({
    orderBy: { weekOf: "desc" },
  });

  // Build the preview context once for every digest so each <details>
  // can render a live preview alongside the edit form.
  const previewContexts = new Map<string, Awaited<ReturnType<typeof buildDigestContext>>>();
  for (const d of digests) {
    const sections = (d.sections ?? []) as unknown as DigestSection[];
    const ctx = await buildDigestContext(sections);
    previewContexts.set(d.id, ctx);
  }

  return (
    <div>
      <div className="mb-4">
        <AdminNav active="digest" />
      </div>
      <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-2">
        אדמין · סיכומים שבועיים
      </div>
      <h1 className="text-3xl font-black mb-6 tracking-tight">ניהול סיכומים</h1>

      <div className="bg-card border border-border p-4 text-[12px] text-foreground-muted leading-relaxed mb-8" style={{ borderRadius: 4 }}>
        <p className="mb-2">
          <strong className="text-foreground">איך להפיק טיוטה חדשה:</strong>{" "}
          הרץ <code className="bg-muted px-1.5 py-0.5 rounded">npx tsx scripts/generate-weekly-digest.mts --apply</code> במכונה. הסקריפט יוצר/מעדכן טיוטה לשבוע האחרון.
        </p>
        <p>
          <strong className="text-foreground">פרסום:</strong>{" "}
          ערוך את הטיוטה כאן, ולחץ "פרסם". הסיכום יופיע מיד ב-/digest. ניתן גם להחזיר לטיוטה ("בטל פרסום").
        </p>
      </div>

      {digests.length === 0 ? (
        <div className="bg-card border border-border-strong p-6 text-center text-sm text-foreground-muted" style={{ borderRadius: 4 }}>
          אין סיכומים. הרץ את הסקריפט כדי לייצר טיוטה ראשונה.
        </div>
      ) : (
        <div className="space-y-6">
          {digests.map((d) => (
            <details
              key={d.id}
              open={d.status === "draft"}
              className="bg-card border border-border-strong overflow-hidden"
              style={{ borderRadius: 4 }}
            >
              <summary className="px-5 py-3.5 border-b border-border cursor-pointer flex items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-sm">{d.title}</div>
                  <div className="text-[11px] text-foreground-muted tabular-nums mt-0.5">
                    {d.weekOf.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}
                    {d.publishedAt && (
                      <>
                        {" · פורסם "}
                        {d.publishedAt.toLocaleDateString("he-IL", { day: "numeric", month: "short" })}
                      </>
                    )}
                  </div>
                </div>
                <span
                  className="text-[10px] uppercase tracking-wider font-bold px-2 py-1"
                  style={{
                    backgroundColor:
                      d.status === "published" ? "var(--verdict-true-bg)" : "var(--verdict-half-bg)",
                    color:
                      d.status === "published" ? "var(--verdict-true)" : "var(--verdict-half)",
                    borderRadius: 2,
                  }}
                >
                  {d.status === "published" ? "מפורסם" : "טיוטה"}
                </span>
              </summary>

              <form action={updateDigest} className="p-5 space-y-4">
                <input type="hidden" name="id" value={d.id} />

                <div>
                  <label className="block text-[10px] uppercase tracking-wider font-bold text-foreground-muted mb-1.5">
                    כותרת
                  </label>
                  <input
                    name="title"
                    defaultValue={d.title}
                    className="w-full px-3 py-2 bg-background border border-border-strong text-sm focus:border-accent focus:outline-none"
                    style={{ borderRadius: 2 }}
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-wider font-bold text-foreground-muted mb-1.5">
                    פתיח
                  </label>
                  <textarea
                    name="intro"
                    defaultValue={d.intro}
                    rows={3}
                    className="w-full px-3 py-2 bg-background border border-border-strong text-sm focus:border-accent focus:outline-none leading-relaxed"
                    style={{ borderRadius: 2 }}
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-wider font-bold text-foreground-muted mb-1.5">
                    מקטעים (JSON)
                  </label>
                  <textarea
                    name="sectionsJson"
                    defaultValue={JSON.stringify(d.sections, null, 2)}
                    rows={20}
                    className="w-full px-3 py-2 bg-background border border-border-strong text-[11px] font-mono leading-tight focus:border-accent focus:outline-none"
                    style={{ borderRadius: 2 }}
                  />
                  <p className="text-[10px] text-foreground-muted mt-1.5 leading-snug">
                    כל מקטע הוא {`{ type, heading, body, items?, claimId?, topicSlug? }`}.{" "}
                    סוגים תקפים: <code>headline_stats</code>, <code>movers</code>, <code>claim</code>, <code>topic</code>.
                  </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-border">
                  <button
                    type="submit"
                    className="bg-foreground text-background px-4 py-2 text-sm font-bold hover:opacity-90 transition-opacity"
                    style={{ borderRadius: 2 }}
                  >
                    שמור שינויים
                  </button>
                  <span className="text-[11px] text-foreground-muted">·</span>
                  {d.status === "draft" ? (
                    <button
                      type="submit"
                      formAction={publishDigest}
                      className="bg-accent text-background px-4 py-2 text-sm font-bold hover:bg-accent-dark transition-colors"
                      style={{ borderRadius: 2 }}
                    >
                      פרסם
                    </button>
                  ) : (
                    <button
                      type="submit"
                      formAction={unpublishDigest}
                      className="bg-card border border-border-strong px-4 py-2 text-sm font-bold hover:bg-muted transition-colors"
                      style={{ borderRadius: 2 }}
                    >
                      בטל פרסום
                    </button>
                  )}
                  <span className="text-[11px] text-foreground-muted">·</span>
                  <button
                    type="submit"
                    formAction={deleteDigest}
                    className="text-[12px] text-foreground-muted hover:text-accent transition-colors ml-auto"
                  >
                    מחק טיוטה
                  </button>
                </div>
              </form>

              {d.status === "published" && (
                <div className="px-5 py-2.5 border-t border-border bg-muted/20 text-[11px]">
                  <a
                    href={`/digest/${digestSlug(d.weekOf)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold hover:text-accent transition-colors"
                  >
                    צפה בעמוד הפומבי ←
                  </a>
                </div>
              )}

              {/* Inline preview — same renderer the public page uses,
                  so what you see here is exactly what readers see.
                  Updates on save. */}
              <div className="border-t-[1.5px] border-border-strong">
                <div className="px-5 py-2 text-[10px] uppercase tracking-wider font-bold text-foreground-muted bg-muted/30">
                  תצוגה מקדימה (מה שהקוראים יראו)
                </div>
                <div className="p-5 bg-background">
                  <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-2">
                    סיכום שבועי · {d.weekOf.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}
                  </div>
                  <h3 className="text-2xl font-black mb-3 tracking-tight">{d.title}</h3>
                  <p className="text-sm text-foreground-muted mb-6 leading-relaxed">{d.intro}</p>
                  <DigestRenderer
                    sections={(d.sections ?? []) as unknown as DigestSection[]}
                    claimMap={previewContexts.get(d.id)?.claimMap}
                    topicMap={previewContexts.get(d.id)?.topicMap}
                  />
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
