import type { Metadata } from "next";
import { getDailyQuiz } from "@/lib/daily-quiz";
import { QuizGame } from "@/components/QuizGame";

// Always serve today's puzzle. The selection is a cheap in-memory pick over a
// small pool; revisit with caching if traffic spikes (that's the good problem).
export const dynamic = "force-dynamic";

const TITLE = "בדוק היומי — אמת או שקר?";
const DESCRIPTION =
  "כל יום, 5 ציטוטים אמיתיים של פוליטיקאים. תנחשו: אמת, חצי אמת, או שקר? בדקו את עצמכם מול בדיקת העובדות, ושתפו את התוצאה.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: "5 ציטוטים, 5 ניחושים. כמה תצליחו?",
    type: "website",
    url: "/quiz",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: "5 ציטוטים, 5 ניחושים. כמה תצליחו?" },
  alternates: { canonical: "/quiz" },
};

export default async function QuizPage() {
  const quiz = await getDailyQuiz();

  if (quiz.claims.length === 0) {
    return (
      <div className="max-w-xl mx-auto text-center py-16">
        <h1 className="text-2xl font-black mb-2">בדוק היומי</h1>
        <p className="text-foreground-muted">
          החידה של היום עדיין לא מוכנה. חזרו עוד מעט.
        </p>
      </div>
    );
  }

  return (
    <div className="py-2">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-black tracking-tight">בדוק היומי</h1>
        <p className="text-foreground-muted text-sm mt-1 max-w-md mx-auto">
          אמת, חצי אמת, או שקר? 5 ציטוטים אמיתיים — נראה אתכם.
        </p>
      </div>
      <QuizGame
        dayNumber={quiz.dayNumber}
        dateKey={quiz.dateKey}
        claims={quiz.claims}
      />
    </div>
  );
}
