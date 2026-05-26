"use client";

import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "ראשי" },
  { href: "/leaderboard", label: "טבלה" },
  { href: "/topics", label: "נושאים" },
  { href: "/parties", label: "מפלגות" },
  { href: "/compare", label: "השוואה" },
  { href: "/about", label: "אודות" },
];

export function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-5 text-sm">
      {LINKS.map((link) => {
        const isActive =
          link.href === "/"
            ? pathname === "/"
            : pathname === link.href || pathname.startsWith(link.href + "/");
        return (
          <a
            key={link.href}
            href={link.href}
            aria-current={isActive ? "page" : undefined}
            className={`relative py-1 transition-colors font-medium ${
              isActive
                ? "text-foreground font-bold"
                : "text-foreground-muted hover:text-foreground"
            }`}
          >
            {link.label}
            {isActive && (
              <span
                aria-hidden="true"
                className="absolute -bottom-0.5 left-0 right-0 h-[2px] bg-accent"
              />
            )}
          </a>
        );
      })}
    </nav>
  );
}
