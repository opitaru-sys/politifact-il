import type { Metadata, Viewport } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";
import { Logo } from "@/components/Logo";
import { getLastUpdate } from "@/lib/queries";

const rubik = Rubik({
  subsets: ["hebrew", "latin"],
  variable: "--font-rubik",
  display: "swap",
});

const TITLE = "בדוק — בדיקת עובדות לפוליטיקאים";
const DESCRIPTION =
  "בדיקת עובדות בלתי-תלויה לפוליטיקאים ישראליים — מי הכי ישר, מי מטעה, ומה האמת מאחורי כל טענה. ללא שיוך פוליטי.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "בדוק",
  keywords: ["בדיקת עובדות", "פוליטיקה ישראלית", "פוליטיקאים", "אמת ושקר", "fact check"],
  authors: [{ name: "Omri Pitaru", url: "https://x.com/opitaru" }],
  openGraph: {
    title: "בדוק — מי הפוליטיקאי הכי ישר?",
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
  themeColor: "#2563eb",
};

function formatLastUpdate(d: Date | null): string {
  if (!d) return "לא ידוע";
  const minutes = Math.floor((Date.now() - d.getTime()) / 60000);
  if (minutes < 60) return `לפני ${minutes} דקות`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `לפני ${days} ימים`;
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
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
        <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-md border-b border-border">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <a href="/" className="flex items-center hover:opacity-80 transition-opacity">
              <Logo size="md" />
            </a>
            <nav className="flex items-center gap-1 text-sm font-medium">
              <a href="/" className="px-3 py-1.5 rounded-lg hover:bg-muted transition-colors">ראשי</a>
              <a href="/leaderboard" className="px-3 py-1.5 rounded-lg hover:bg-muted transition-colors">טבלה</a>
              <a href="/parties" className="px-3 py-1.5 rounded-lg hover:bg-muted transition-colors">מפלגות</a>
              <a href="/about" className="px-3 py-1.5 rounded-lg hover:bg-muted transition-colors">אודות</a>
            </nav>
          </div>
        </header>

        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-xs text-amber-900">
          ⚠️ בדיקות העובדות מבוצעות באמצעות בינה מלאכותית ועלולות להכיל שגיאות. אין להסתמך על תוכן זה כעל עובדה מאומתת. נמצאה שגיאה? דווחו עליה בכפתור שבכל טענה.
        </div>

        <div className="bg-muted/60 border-b border-border px-4 py-1.5 text-center text-[11px] text-gray-600 flex items-center justify-center gap-3">
          <span title={lastUpdate?.toLocaleString("he-IL")}>
            🔄 עודכן: <strong>{lastUpdateText}</strong>
          </span>
          <span className="text-gray-400">·</span>
          <span>מעודכן יומית</span>
          <span className="text-gray-400">·</span>
          <span>ללא שיוך פוליטי</span>
        </div>

        <main className="max-w-5xl mx-auto px-4 py-8">
          {children}
        </main>

        <footer className="border-t border-border mt-16 py-8 text-sm text-gray-500">
          <div className="max-w-5xl mx-auto px-4 flex flex-col items-center gap-3">
            <div className="opacity-70">
              <Logo size="sm" />
            </div>
            <p className="text-xs text-gray-600 text-center max-w-2xl">
              <strong>בדוק</strong> הוא אתר בדיקת עובדות בלתי-תלוי. אין לנו שיוך לאף מפלגה, גוף פוליטי או אינטרס כלשהו —
              אנו בודקים טענות של פוליטיקאים מכל קצוות הקשת הפוליטית באותה מידה ובאותם כלים.
            </p>
            <p className="text-xs text-gray-400 flex items-center gap-2 flex-wrap justify-center">
              <a href="/about" className="hover:text-foreground transition-colors underline">אודות</a>
              <span>·</span>
              <span>נבנה על ידי</span>
              <a href="https://x.com/opitaru" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors font-medium">Omri Pitaru</a>
              <span>·</span>
              <a href="https://x.com/opitaru" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">X</a>
              <span>·</span>
              <a href="https://www.linkedin.com/in/omripitaru/" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">LinkedIn</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
