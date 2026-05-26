/**
 * Shared admin tab bar. Auth now lives in an httpOnly cookie
 * (see src/lib/admin-auth.ts), so links no longer carry `?key=` —
 * the cookie travels with every request automatically.
 *
 * The "התנתק" item invokes the logoutAction server action which
 * clears the cookie and redirects to /admin/login.
 */
import Link from "next/link";
import { logoutAction } from "@/app/admin/login/actions";

export type AdminTabId = "status" | "claims" | "reports" | "digest";

const TABS: { id: AdminTabId; label: string; href: string }[] = [
  { id: "status", label: "סטטוס", href: "/admin/status" },
  { id: "claims", label: "עריכת טענות", href: "/admin/claims" },
  { id: "reports", label: "דיווחים", href: "/admin/reports" },
  { id: "digest", label: "סיכומים", href: "/admin/digest" },
];

export function AdminNav({ active }: { active: AdminTabId }) {
  return (
    <nav className="flex items-center gap-1 text-[11px] tracking-wider uppercase flex-wrap">
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          className={
            t.id === active
              ? "text-foreground font-bold border-b-2 border-accent pb-1 ml-3"
              : "text-foreground-muted hover:text-foreground font-medium border-b-2 border-transparent pb-1 ml-3"
          }
        >
          {t.label} {t.id !== active && "→"}
        </Link>
      ))}
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
