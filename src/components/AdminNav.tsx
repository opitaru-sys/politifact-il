/**
 * Shared admin tab bar. Auth now lives in an httpOnly cookie
 * (see src/lib/admin-auth.ts), so links no longer carry `?key=` —
 * the cookie travels with every request automatically.
 *
 * The "התנתק" item invokes the logoutAction server action which
 * clears the cookie and redirects to /admin/login.
 *
 * Queue counts (reports + comments) are fetched here and shown in
 * parentheses next to the tab label so the admin can see workload at
 * a glance without clicking. Two cheap COUNT() queries per render —
 * acceptable for an admin-only page.
 */
import Link from "next/link";
import { prisma } from "@/lib/db";
import { logoutAction } from "@/app/admin/login/actions";

export type AdminTabId =
  | "status"
  | "claims"
  | "reports"
  | "review"
  | "comments"
  | "digest";

const TABS: { id: AdminTabId; label: string; href: string }[] = [
  { id: "status", label: "סטטוס", href: "/admin/status" },
  { id: "claims", label: "עריכת טענות", href: "/admin/claims" },
  { id: "reports", label: "דיווחים", href: "/admin/reports" },
  { id: "review", label: "בדיקה אנושית", href: "/admin/review" },
  { id: "comments", label: "תגובות", href: "/admin/comments" },
  { id: "digest", label: "סיכומים", href: "/admin/digest" },
];

export async function AdminNav({ active }: { active: AdminTabId }) {
  // Open queues. Reports drop to 0 as the editor dismisses/applies them
  // (the row is deleted), so this IS the unread count. Comments don't
  // have a read/unread state today, so this is total — switch to "since
  // last admin visit" if/when that becomes a real signal.
  const [reportsCount, reviewCount, commentsCount] = await Promise.all([
    prisma.report.count(),
    prisma.claim.count({ where: { status: "review" } }),
    prisma.comment.count(),
  ]);

  const counts: Partial<Record<AdminTabId, number>> = {
    reports: reportsCount,
    review: reviewCount,
    comments: commentsCount,
  };

  return (
    <nav className="flex items-center gap-1 text-[11px] tracking-wider uppercase flex-wrap">
      {TABS.map((t) => {
        const count = counts[t.id];
        return (
          <Link
            key={t.id}
            href={t.href}
            className={
              t.id === active
                ? "text-foreground font-bold border-b-2 border-accent pb-1 ml-3"
                : "text-foreground-muted hover:text-foreground font-medium border-b-2 border-transparent pb-1 ml-3"
            }
          >
            {t.label}
            {typeof count === "number" && (
              <span className="text-foreground-muted font-normal mr-1">({count})</span>
            )}
            {t.id !== active && " →"}
          </Link>
        );
      })}
      <form action={logoutAction} className="ml-auto">
        <button
          type="submit"
          className="text-foreground-muted hover:text-accent font-medium border-b-2 border-transparent pb-1 cursor-pointer"
        >
          התנתק ←
        </button>
      </form>
    </nav>
  );
}
