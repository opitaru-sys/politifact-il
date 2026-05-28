import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Rubik } from "next/font/google";
import "./globals.css";
import { Logo } from "@/components/Logo";
import { HeaderNav } from "@/components/HeaderNav";
import { PostHogProvider } from "@/components/PostHogProvider";
import { PostHogPageView } from "@/components/PostHogPageView";
import { getLastUpdate } from "@/lib/queries";
import { safeJsonLd } from "@/lib/jsonld";

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

// Site-wide structured data. Organization + WebSite give Google an entity
// to attach the brand, founder, and social profiles to (knowledge panel).
// No SearchAction sitelinks box — search is an autocomplete that jumps
// straight to a politician profile, there's no /search results URL to
// point the box at.
const SITE_JSONLD = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "בדוק",
    alternateName: "Baduk",
    url: SITE_URL,
    logo: `${SITE_URL}/icon`,
    description: DESCRIPTION,
    founder: { "@type": "Person", name: "Omri Pitaru", url: "https://www.linkedin.com/in/omripitaru/" },
    sameAs: ["https://x.com/opitaru", "https://www.linkedin.com/in/omripitaru/"],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "בדוק",
    alternateName: "Baduk",
    url: SITE_URL,
    inLanguage: "he-IL",
    description: DESCRIPTION,
    publisher: { "@type": "Organization", name: "בדוק", url: SITE_URL },
  },
];

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "בדוק",
  keywords: ["בדיקת עובדות", "פוליטיקה ישראלית", "פוליטיקאים", "אמת ושקר", "fact check"],
  authors: [{ name: "Omri Pitaru", url: "https://www.linkedin.com/in/omripitaru/" }],
  openGraph: {
    title: "בדוק | מי הפוליטיקאי הכי מדויק?",
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
        {/* Site-wide Organization + WebSite structured data. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(SITE_JSONLD) }}
        />
        {/* PostHog wraps everything so any client component can use
            `usePostHog()` for custom events later. PageView is in its
            own Suspense boundary because useSearchParams suspends
            during the static-shell pass; without the boundary the
            entire app would fall behind that suspense. */}
        <PostHogProvider>
          <Suspense fallback={null}>
            <PostHogPageView />
          </Suspense>
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

        {/* AI methodology warning — compact tagline on mobile (3 lines
            tall and easy to dismiss visually), full disclaimer on
            tablet+. The trust signal is still on every viewport; on
            mobile we trim the secondary clauses so the first-screen
            doesn't get dominated by chrome. */}
        <div
          className="px-4 sm:px-5 py-2 text-center text-[11px] leading-snug sm:leading-relaxed border-b border-border"
          style={{
            backgroundColor: "var(--verdict-half-bg)",
            color: "var(--verdict-half)",
          }}
        >
          {/* Mobile: short form. */}
          <span className="sm:hidden">
            <strong className="tracking-wide">הערה:</strong> בדיקות AI עלולות להכיל שגיאות.{" "}
            <a href="/corrections" className="underline font-medium">דווחו על שגיאה</a>.
          </span>
          {/* Tablet+: full form. */}
          <span className="hidden sm:inline">
            <strong className="tracking-wide">הערה:</strong> בדיקות העובדות מבוצעות באמצעות בינה מלאכותית ועלולות להכיל שגיאות.{" "}
            <span className="opacity-90">
              אין להסתמך על תוכן זה כעובדה מאומתת. נמצאה שגיאה? דווחו בכפתור שבכל טענה, או פנו ב-
              <a href="/corrections" className="underline hover:no-underline font-medium">תיקונים והסרות</a>.
            </span>
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
              <Link href="/corrections" className="hover:text-foreground transition-colors">תיקונים</Link>
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
        </PostHogProvider>
      </body>
    </html>
  );
}
