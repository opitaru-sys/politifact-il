import type { Metadata, Viewport } from "next";
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

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "בדוק",
  keywords: ["בדיקת עובדות", "פוליטיקה ישראלית", "פוליטיקאים", "אמת ושקר", "fact check"],
  authors: [{ name: "Omri Pitaru", url: "https://x.com/opitaru" }],
  openGraph: {
    title: "בדוק | מי הפוליטיקאי הכי אמין?",
    description: DESCRIPTION,
    locale: "he_IL",
    type: "website",
    siteName: "בדוק",
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
            <a
              href="/"
              className="flex items-center hover:opacity-70 transition-opacity"
              aria-label="בדוק, לעמוד הראשי"
            >
              <Logo size="md" />
            </a>
            <HeaderNav />
          </div>
          <div className="bg-foreground text-background px-5 py-1.5 text-center text-[10px] tracking-[0.2em] uppercase">
            <span className="opacity-90">בדיקת עובדות לפוליטיקאים ישראליים</span>
            <span className="mx-3 opacity-40">·</span>
            <span className="opacity-90">ללא שיוך פוליטי</span>
            <span className="mx-3 opacity-40 hidden sm:inline">·</span>
            <span className="opacity-90 hidden sm:inline" title={lastUpdate?.toLocaleString("he-IL")}>
              עודכן {lastUpdateText}
            </span>
          </div>
        </header>

        <div
          className="px-5 py-2.5 text-center text-[11px] leading-relaxed"
          style={{
            backgroundColor: "var(--verdict-half-bg)",
            color: "var(--verdict-half)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <strong className="tracking-wide">הערה:</strong> בדיקות העובדות מבוצעות באמצעות בינה מלאכותית ועלולות להכיל שגיאות.{" "}
          <span className="opacity-90">אין להסתמך על תוכן זה כעובדה מאומתת. נמצאה שגיאה? דווחו עליה בכפתור שבכל טענה.</span>
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
              <a href="/about" className="hover:text-foreground transition-colors">אודות</a>
              <a
                href="https://x.com/opitaru"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                X · @opitaru
              </a>
              <a
                href="https://www.linkedin.com/in/omripitaru/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                LinkedIn · Omri Pitaru
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
