"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const LINKS = [
  { href: "/", label: "ראשי" },
  { href: "/quiz", label: "בדוק היומי" },
  { href: "/digest", label: "תובנות השבוע" },
  { href: "/leaderboard", label: "טבלה" },
  { href: "/topics", label: "נושאים" },
  { href: "/parties", label: "מפלגות" },
  { href: "/compare", label: "השוואה" },
  { href: "/about", label: "אודות" },
];

/**
 * Responsive nav. Six links fit comfortably above the `sm` breakpoint
 * (640px) but on a 360px phone they overflow the row and cause
 * horizontal page scroll. Below sm we collapse to a hamburger that
 * opens a full-width dropdown panel anchored below the header.
 *
 * Why hamburger over a horizontal-scroll strip: scroll on a nav reads
 * as "broken layout" to most users; a hamburger is the universal
 * mobile pattern they reach for first.
 */
export function HeaderNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the menu when the route changes (link click in mobile mode).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Desktop / tablet: inline horizontal row. */}
      <nav className="hidden sm:flex items-center gap-5 text-sm">
        {LINKS.map((link) => {
          const isActive = isLinkActive(link.href, pathname);
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

      {/* Mobile: hamburger button + dropdown panel. */}
      <div className="sm:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-nav-panel"
          aria-label={open ? "סגור תפריט" : "פתח תפריט"}
          className="flex items-center justify-center w-9 h-9 -m-1 hover:bg-muted/50 transition-colors"
          style={{ borderRadius: 4 }}
        >
          {open ? (
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M3 3 L15 15 M15 3 L3 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="20" height="14" viewBox="0 0 20 14" aria-hidden="true">
              <path d="M0 1 H20 M0 7 H20 M0 13 H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          )}
        </button>

        {open && (
          <div
            id="mobile-nav-panel"
            className="absolute left-0 right-0 top-full bg-background border-b-[1.5px] border-border-strong shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
          >
            <ul className="max-w-5xl mx-auto px-5 py-2">
              {LINKS.map((link) => {
                const isActive = isLinkActive(link.href, pathname);
                return (
                  <li key={link.href} className="border-b border-border last:border-b-0">
                    <a
                      href={link.href}
                      aria-current={isActive ? "page" : undefined}
                      className={`block py-3 text-base transition-colors ${
                        isActive
                          ? "text-foreground font-bold"
                          : "text-foreground-muted hover:text-foreground"
                      }`}
                    >
                      {link.label}
                      {isActive && (
                        <span
                          aria-hidden="true"
                          className="inline-block w-1.5 h-1.5 bg-accent ml-2 align-middle"
                          style={{ borderRadius: 1 }}
                        />
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}

function isLinkActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}
