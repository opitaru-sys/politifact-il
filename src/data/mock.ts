export type Verdict = "true" | "half-true" | "false";

export interface Politician {
  id: string;
  name: string;
  party: string;
  image: string;
  role?: string;
}

export interface Claim {
  id: string;
  politicianId: string;
  quote: string;
  verdict: Verdict;
  explanation: string;
  source: string;
  sourceUrl: string;
  factSource?: string | null;
  factSourceUrl?: string | null;
  date: string; // ISO date
  topic: string;
}

export const politicians: Politician[] = [
  {
    id: "netanyahu",
    name: "בנימין נתניהו",
    party: "הליכוד",
    image: "/politicians/netanyahu.jpg",
    role: "ראש הממשלה",
  },
  {
    id: "lapid",
    name: "יאיר לפיד",
    party: "יש עתיד",
    image: "/politicians/lapid.jpg",
    role: "יו\"ר האופוזיציה",
  },
  {
    id: "smotrich",
    name: "בצלאל סמוטריץ'",
    party: "הציונות הדתית",
    image: "/politicians/smotrich.jpg",
    role: "שר האוצר",
  },
  {
    id: "ben-gvir",
    name: "איתמר בן גביר",
    party: "עוצמה יהודית",
    image: "/politicians/ben-gvir.jpg",
    role: "שר הביטחון הלאומי",
  },
  {
    id: "gantz",
    name: "בני גנץ",
    party: "המחנה הממלכתי",
    image: "/politicians/gantz.jpg",
  },
  {
    id: "lieberman",
    name: "אביגדור ליברמן",
    party: "ישראל ביתנו",
    image: "/politicians/lieberman.jpg",
  },
  {
    id: "deri",
    name: "אריה דרעי",
    party: "ש\"ס",
    image: "/politicians/deri.jpg",
    role: "יו\"ר ש\"ס",
  },
  {
    id: "yishai",
    name: "אלי ישי",
    party: "ש\"ס",
    image: "/politicians/yishai.jpg",
  },
];

export const claims: Claim[] = [
  {
    id: "1",
    politicianId: "netanyahu",
    quote: "האבטלה בישראל עומדת על 2.1% — הכי נמוכה בתולדות המדינה",
    verdict: "false",
    explanation: "לפי נתוני הלמ\"ס, שיעור האבטלה עומד על 4.8% נכון לאפריל 2026. השיעור הנמוך ביותר שנרשם אי פעם היה 3.1% בתחילת 2022.",
    source: "Ynet",
    sourceUrl: "https://ynet.co.il",
    factSource: "נתוני הלמ\"ס — סקר כוח אדם",
    factSourceUrl: "https://www.cbs.gov.il",
    date: "2026-05-14",
    topic: "כלכלה",
  },
  {
    id: "2",
    politicianId: "netanyahu",
    quote: "התקציב שהעברנו הוא הגדול ביותר שהועבר לחינוך",
    verdict: "half-true",
    explanation: "התקציב הנומינלי אכן הגדול ביותר (98 מיליארד ₪), אך כאחוז מהתמ\"ג הוא דווקא ירד מ-6.2% ל-5.8% בהשוואה לשנה שעברה. בהתחשב באינפלציה, מדובר בעלייה ריאלית של 1.2% בלבד.",
    source: "N12",
    sourceUrl: "https://n12.co.il",
    factSource: "תקציב המדינה — משרד החינוך",
    factSourceUrl: "https://mof.gov.il",
    date: "2026-05-13",
    topic: "חינוך",
  },
  {
    id: "3",
    politicianId: "netanyahu",
    quote: "אנחנו לא מעלים מיסים לאזרחים",
    verdict: "false",
    explanation: "בינואר 2026 עלה המע\"מ ל-18%, ובמרץ אושרה העלאת מס הכנסה על מדרגות הביניים. שתי העלאות משפיעות ישירות על כיס האזרחים.",
    source: "כלכליסט",
    sourceUrl: "https://calcalist.co.il",
    factSource: "חוק מע\"מ + חוק ההסדרים 2026",
    factSourceUrl: "https://main.knesset.gov.il",
    date: "2026-05-12",
    topic: "כלכלה",
  },
  {
    id: "4",
    politicianId: "lapid",
    quote: "הקואליציה הצביעה נגד חוק חטופים 3 פעמים",
    verdict: "half-true",
    explanation: "הקואליציה הצביעה נגד שתי הצעות חוק שעסקו בנושא החטופים, לא שלוש. הצבעה שלישית שלפיד מתייחס אליה הייתה הסתייגות בוועדה ולא הצבעה במליאה.",
    source: "כאן חדשות",
    sourceUrl: "https://kan.org.il",
    factSource: "פרוטוקולי הצבעות הכנסת",
    factSourceUrl: "https://main.knesset.gov.il",
    date: "2026-05-14",
    topic: "ביטחון",
  },
  {
    id: "5",
    politicianId: "lapid",
    quote: "ממשלת לפיד הורידה את יוקר המחיה ב-7%",
    verdict: "false",
    explanation: "מדד המחירים לצרכן עלה ב-2.3% בתקופת כהונת ממשלת לפיד (יוני 2022 - דצמבר 2022). לא הייתה ירידה ביוקר המחיה.",
    source: "Ynet",
    sourceUrl: "https://ynet.co.il",
    factSource: "מדד המחירים לצרכן — הלמ\"ס",
    factSourceUrl: "https://www.cbs.gov.il",
    date: "2026-05-11",
    topic: "כלכלה",
  },
  {
    id: "6",
    politicianId: "smotrich",
    quote: "ההתנחלויות לא עולות לישראל שקל",
    verdict: "false",
    explanation: "לפי דו\"ח מבקר המדינה 2025, התקציב הממשלתי הייעודי להתנחלויות עמד על 2.8 מיליארד ₪, לא כולל תשתיות ביטחוניות.",
    source: "הארץ",
    sourceUrl: "https://haaretz.co.il",
    factSource: "דו\"ח מבקר המדינה 2025",
    factSourceUrl: "https://www.mevaker.gov.il",
    date: "2026-05-13",
    topic: "התנחלויות",
  },
  {
    id: "7",
    politicianId: "smotrich",
    quote: "הגירעון התקציבי קטן ביחס למדינות אירופה",
    verdict: "half-true",
    explanation: "הגירעון (6.2% מהתמ\"ג) אכן נמוך מיוון ואיטליה, אך גבוה מהממוצע באירופה (3.1%) ומהמלצות ה-OECD לישראל.",
    source: "גלובס",
    sourceUrl: "https://globes.co.il",
    factSource: "נתוני OECD — גירעון תקציבי",
    factSourceUrl: "https://data.oecd.org",
    date: "2026-05-10",
    topic: "כלכלה",
  },
  {
    id: "8",
    politicianId: "ben-gvir",
    quote: "הפשיעה במגזר הערבי ירדה ב-30% מאז שנכנסתי לתפקיד",
    verdict: "false",
    explanation: "לפי נתוני משטרת ישראל, הפשיעה במגזר הערבי עלתה ב-12% בשנת 2025 לעומת 2022. מספר הרציחות ירד ב-8% אך סך האלימות עלה.",
    source: "N12",
    sourceUrl: "https://n12.co.il",
    factSource: "נתוני משטרת ישראל — דו\"ח שנתי",
    factSourceUrl: "https://www.gov.il/he/departments/israel_police",
    date: "2026-05-15",
    topic: "ביטחון פנים",
  },
  {
    id: "9",
    politicianId: "ben-gvir",
    quote: "חילקנו 150,000 רישיונות נשק לאזרחים",
    verdict: "true",
    explanation: "לפי נתוני אגף הרישוי במשרד לביטחון לאומי, אושרו כ-148,000 רישיונות חדשים מאז ינואר 2023. המספר עגול אך בגדול מדויק.",
    source: "ישראל היום",
    sourceUrl: "https://israelhayom.co.il",
    factSource: "אגף הרישוי — משרד לביטחון לאומי",
    factSourceUrl: "https://www.gov.il/he/departments/ministry_of_national_security",
    date: "2026-05-12",
    topic: "ביטחון פנים",
  },
  {
    id: "10",
    politicianId: "gantz",
    quote: "הצבא פועל ללא תקציב מאושר כבר 4 חודשים",
    verdict: "true",
    explanation: "תקציב הביטחון ל-2026 אושר באיחור של 4 חודשים ביחס ללוח הזמנים המקורי. עד לאישורו בפברואר, צה\"ל פעל בתקציב המשכי.",
    source: "כאן חדשות",
    sourceUrl: "https://kan.org.il",
    factSource: "לוח זמנים תקציב הביטחון — כנסת",
    factSourceUrl: "https://main.knesset.gov.il",
    date: "2026-05-14",
    topic: "ביטחון",
  },
  {
    id: "11",
    politicianId: "lieberman",
    quote: "הקואליציה העבירה 0 חוקים כלכליים השנה",
    verdict: "false",
    explanation: "הקואליציה העבירה 3 חוקים כלכליים מאז ינואר 2026: תיקון חוק מע\"מ, חוק הסדרים חלקי, וחוק הקלות מס לעסקים קטנים.",
    source: "דה מרקר",
    sourceUrl: "https://themarker.com",
    factSource: "ספר החוקים — רשומות",
    factSourceUrl: "https://main.knesset.gov.il",
    date: "2026-05-11",
    topic: "כלכלה",
  },
  {
    id: "12",
    politicianId: "deri",
    quote: "מוסדות החינוך החרדי עומדים בכל דרישות הליבה",
    verdict: "false",
    explanation: "לפי דו\"ח משרד החינוך 2025, רק 23% ממוסדות החינוך החרדי עומדים בדרישות לימודי הליבה המלאות. 41% מלמדים ליבה חלקית.",
    source: "Ynet",
    sourceUrl: "https://ynet.co.il",
    factSource: "דו\"ח משרד החינוך 2025",
    factSourceUrl: "https://edu.gov.il",
    date: "2026-05-09",
    topic: "חינוך",
  },
];

export function getPolitician(id: string): Politician | undefined {
  return politicians.find((p) => p.id === id);
}

export function getClaimsForPolitician(politicianId: string): Claim[] {
  return claims.filter((c) => c.politicianId === politicianId);
}

export function getRecentClaims(days: number = 7): Claim[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return claims
    .filter((c) => new Date(c.date) >= cutoff)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export interface PoliticianStats {
  politician: Politician;
  totalClaims: number;
  trueClaims: number;
  halfTrueClaims: number;
  falseClaims: number;
  truthPercentage: number;
}

export function getPoliticianStats(): PoliticianStats[] {
  return politicians
    .map((p) => {
      const pClaims = getClaimsForPolitician(p.id);
      const trueClaims = pClaims.filter((c) => c.verdict === "true").length;
      const halfTrueClaims = pClaims.filter((c) => c.verdict === "half-true").length;
      const falseClaims = pClaims.filter((c) => c.verdict === "false").length;
      const total = pClaims.length;
      const truthPercentage = total > 0 ? Math.round(((trueClaims + halfTrueClaims * 0.5) / total) * 100) : 0;
      return {
        politician: p,
        totalClaims: total,
        trueClaims,
        halfTrueClaims,
        falseClaims,
        truthPercentage,
      };
    })
    .filter((s) => s.totalClaims > 0)
    .sort((a, b) => a.truthPercentage - b.truthPercentage);
}

export function getPartyStats() {
  const partyMap: Record<string, { trueClaims: number; halfTrue: number; falseClaims: number; total: number }> = {};

  for (const claim of claims) {
    const politician = getPolitician(claim.politicianId);
    if (!politician) continue;
    const party = politician.party;
    if (!partyMap[party]) {
      partyMap[party] = { trueClaims: 0, halfTrue: 0, falseClaims: 0, total: 0 };
    }
    partyMap[party].total++;
    if (claim.verdict === "true") partyMap[party].trueClaims++;
    if (claim.verdict === "half-true") partyMap[party].halfTrue++;
    if (claim.verdict === "false") partyMap[party].falseClaims++;
  }

  return Object.entries(partyMap)
    .map(([party, stats]) => ({
      party,
      ...stats,
      truthPercentage: Math.round(((stats.trueClaims + stats.halfTrue * 0.5) / stats.total) * 100),
    }))
    .sort((a, b) => a.truthPercentage - b.truthPercentage);
}
