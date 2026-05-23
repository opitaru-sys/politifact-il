import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Rubik } from "next/font/google";
import "./globals.css";
import { Logo } from "@/components/Logo";
import { HeaderNav } from "@/components/HeaderNav";
import { getLastUpdate } from "@/lib/queries";

const rubik = Rubik({
  subsets: ["hebrew", "latin"],
  variable: "--font-rubik",
  display: "swap",
});

const TITLE = "בדוק | בדיקת עובדות לפוליטיקאים";
const DESCRIPTION =
  "בדיקת עובדות בלתי-תלויה לפוליטיקאים ישראליים. מי הכי ישר, מי מטעה, ומה האמת מאחורי כל טענה. ללא שיוך פוליטי.";

// Base URL used by Next.js to expand relative OG / Twitter / canonical
// links into absolute URLs. Critical for link previews: WhatsApp /
// Telegram / X fetch the OG image as an absolute URL, so if this points
// at a domain that doesn't resolve, the preview shows title + description
// but no image (which is exactly what was happening while bduk.co.il
// was still pending DNS propagation through ISOC-IL).
//
// Resolution order:
//   1. NEXT_PUBLIC_SITE_URL — explicit override. Set this once bduk.co.il
//      DNS is live to pin the canonical domain.
//   2. VERCEL_PROJECT_PRODUCTION_URL — Vercel auto-injects this on every
//      deploy (hostname only, no protocol). It always points at the
//      stable production domain, so previews work as soon as the site
//      is deployed, no manual env var needed.
//   3. Hard-coded bduk.co.il fallback — used only when neither of the
//      above is present (local dev, build outside Vercel, etc.).
const SITE_URL = (() => {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "https://bduk.co.il";
})();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "בדוק",
  keywords: ["בדיקת עובדות", "פוליטיקה ישראלית", "פוליטיקאים", "אמת ושקר", "fact check"],
  authors: [{ name: "Omri Pitaru", url: "https://www.linkedin.com/in/omripitaru/" }],
  openGraph: {
    title: "בדוק | מי הפוליטיקאי הכי אמין?",
    description: DESCRIPTION,
    locale: "he_IL",
    type: "website",
    siteName: "בדוק",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    creator: "@opitaru",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#b3242a",
};

function formatLastUpdate(d: Date | null): string {
  if (!d) return "לא ידוע";
  const minutes = Math.floor((Date.now() - d.getTime()) / 60000);
  if (minutes < 1) return "לפני רגע";
  if (minutes < 60) return `לפני ${minutes} דקות`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `לפני ${days} ימים`;
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lastUpdate = await getLastUpdate();
  const lastUpdateText = formatLastUpdate(lastUpdate);

  return (
    <html lang="he" dir="rtl" className={rubik.variable}>
      <body className="min-h-screen bg-background text-foreground">
        <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b-[1.5px] border-border-strong">
          <div className="max-w-5xl mx-auto px-5 py-3.5 flex items-center justify-between">
            <Link
              href="/"
              className="flex items-center hover:opacity-70 transition-opacity"
              aria-label="בדוק, לעמוד הראשי"
            >
              <Logo size="md" />
            </Link>
            <HeaderNav />
          </div>
          {/* Beta strip — full text on desktop, abbreviated on mobile so the
              first viewport isn't dominated by chrome. */}
          <div className="bg-foreground text-background px-5 py-1.5 text-center text-[10px] tracking-[0.2em] uppercase flex items-center justify-center gap-3 flex-wrap">
            <span
              className="font-bold px-2 py-0.5 bg-accent text-background"
              style={{ borderRadius: 2 }}
            >
              בטא
            </span>
            <span className="opacity-90 hidden sm:inline">בדיקת עובדות לפוליטיקאים ישראליים</span>
            <span className="opacity-90 sm:hidden">בדיקת עובדות</span>
            <span className="opacity-40 hidden sm:inline">·</span>
            <span className="opacity-90 hidden sm:inline">ללא שיוך פוליטי</span>
            <span className="opacity-40 hidden sm:inline">·</span>
            <span className="opacity-90 hidden sm:inline" title={lastUpdate?.toLocaleString("he-IL")}>
              עודכן {lastUpdateText}
            </span>
          </div>
        </header>

        {/* AI methodology warning — full text on every viewport. Earlier
            we had a compact mobile variant but the user wants the full
            disclaimer visible everywhere because it's a core trust
            signal, not chrome. Slightly tighter line-height on mobile
            so it doesn't dominate the first viewport. */}
        <div
          className="px-4 sm:px-5 py-2 text-center text-[11px] leading-snug sm:leading-relaxed border-b border-border"
          style={{
            backgroundColor: "var(--verdict-half-bg)",
            color: "var(--verdict-half)",
          }}
        >
          <strong className="tracking-wide">הערה:</strong> בדיקות העובדות מבוצעות באמצעות בינה מלאכותית ועלולות להכיל שגיאות.{" "}
          <span className="opacity-90">
            אין להסתמך על תוכן זה כעובדה מאומתת. נמצאה שגיאה? דווחו בכפתור שבכל טענה, או פנו ב-
            <a href="/about#takedown" className="underline hover:no-underline font-medium">תיקונים והסרות</a>.
          </span>
        </div>

        <main className="max-w-5xl mx-auto px-5 py-10">
          {children}
        </main>

        <footer className="border-t-[1.5px] border-border-strong mt-20 py-10 text-sm text-foreground-muted">
          <div className="max-w-5xl mx-auto px-5 grid gap-6 md:grid-cols-[1fr_auto] items-start">
            <div className="space-y-3 max-w-xl">
              <Logo size="sm" />
              <p className="text-xs leading-relaxed">
                <strong className="text-foreground">בדוק</strong> הוא אתר בדיקת עובדות בלתי-תלוי. אין שיוך לאף מפלגה,
                גוף פוליטי או אינטרס. טענות של פוליטיקאים מכל קצוות הקשת נבדקות באותה מידה ובאותם כלים.
              </p>
            </div>
            <div className="flex flex-col items-start md:items-end gap-2 text-[11px] tracking-wider uppercase">
              <Link href="/about" className="hover:text-foreground transition-colors">אודות</Link>
              <a
                href="https://www.linkedin.com/in/omripitaru/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                Omri Pitaru · LinkedIn ↗
              </a>
              <a
                href="https://x.com/opitaru"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                X · @opitaru ↗
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
