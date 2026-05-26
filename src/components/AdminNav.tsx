/**
 * Shared admin tab bar. Was previously duplicated across status/claims/
 * reports as three local copies; extracted here so adding a new admin
 * page (like /admin/digest) is one entry, not three identical edits.
 *
 * Each admin page passes `active` (string id) so the right tab is
 * highlighted, and `adminKey` so the per-tab hrefs carry the secret
 * forward.
 */
import Link from "next/link";

export type AdminTabId = "status" | "claims" | "reports" | "digest";

const TABS: { id: AdminTabId; label: string; href: (key: string) => string }[] = [
  { id: "status", label: "סטטוס", href: (k) => `/admin/status?key=${k}` },
  { id: "claims", label: "עריכת טענות", href: (k) => `/admin/claims?key=${k}` },
  { id: "reports", label: "דיווחים", href: (k) => `/admin/reports?key=${k}` },
  { id: "digest", label: "סיכומים", href: (k) => `/admin/digest?key=${k}` },
];

export function AdminNav({ active, adminKey }: { active: AdminTabId; adminKey: string }) {
  return (
    <nav className="flex items-center gap-1 text-[11px] tracking-wider uppercase flex-wrap">
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={t.href(adminKey)}
          className={
            t.id === active
              ? "text-foreground font-bold border-b-2 border-accent pb-1 ml-3"
              : "text-foreground-muted hover:text-foreground font-medium border-b-2 border-transparent pb-1 ml-3"
          }
        >
          {t.label} {t.id !== active && "→"}
        </Link>
      ))}
    </nav>
  );
}
