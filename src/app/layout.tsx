import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";

const rubik = Rubik({
  subsets: ["hebrew", "latin"],
  variable: "--font-rubik",
  display: "swap",
});

export const metadata: Metadata = {
  title: "בדק — בדיקת עובדות לפוליטיקאים",
  description: "שקרן השבוע, טבלת אמינות, ובדיקת עובדות לכל טענה של פוליטיקאי ישראלי",
  openGraph: {
    title: "בדק — מי שיקר השבוע?",
    description: "בדיקת עובדות לפוליטיקאים ישראליים. טענות, מקורות, ותוצאות.",
    locale: "he_IL",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className={rubik.variable}>
      <body className="min-h-screen bg-background text-foreground font-[var(--font-rubik)]">
        <header className="sticky top-0 z-50 bg-white border-b border-border">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <a href="/" className="text-2xl font-black text-foreground">
              בדק
            </a>
            <nav className="flex gap-4 text-sm font-medium">
              <a href="/" className="hover:text-verdict-false transition-colors">ראשי</a>
              <a href="/leaderboard" className="hover:text-verdict-false transition-colors">טבלה</a>
              <a href="/parties" className="hover:text-verdict-false transition-colors">מפלגות</a>
            </nav>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-6">
          {children}
        </main>
        <footer className="border-t border-border mt-12 py-6 text-center text-sm text-gray-500">
          <div className="max-w-4xl mx-auto px-4 flex flex-col items-center gap-2">
            <p>בדק — בדיקת עובדות לפוליטיקאים ישראליים | כל הנתונים מבוססים על מקורות ציבוריים</p>
            <p className="flex items-center gap-1">
              <span>נבנה על ידי</span>{" "}
              <a href="https://x.com/opitaru" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">Omri Pitaru</a>
              <span>·</span>
              <a href="https://x.com/opitaru" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">X</a>
              <span>·</span>
              <a href="https://www.linkedin.com/in/omripitaru/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">LinkedIn</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
