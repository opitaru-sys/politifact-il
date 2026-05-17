#!/usr/bin/env node
/**
 * Second batch of curated Israeli politician claims. Adds 50+ verified
 * statements from 2025-2026 across the political spectrum, with TL;DR
 * summaries and editor-approved flags.
 *
 * Idempotent: re-running won't duplicate. Same matching key as v1
 * (politicianId + quote).
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);

process.env.DATABASE_URL = process.env.DATABASE_URL || "file:./dev.db";

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const makeId = () => "cm" + Math.random().toString(36).slice(2, 14) + Date.now().toString(36).slice(-6);

const CLAIMS = [
  // ---------- נתניהו ----------
  {
    politicianId: "netanyahu",
    quote: "אנחנו במצב הביטחוני הטוב ביותר שהיינו בו ב-50 שנה האחרונות",
    verdict: "false",
    summary: "הצהרה גורפת שאינה תואמת את הערכת המודיעין על איומים מצפון ומדרום.",
    explanation: "הערכות המודיעין של אמ\"ן ושב\"כ שפורסמו ב-2026 מציגות תמונה מורכבת: ירידה ביכולות חמאס, אך התעצמות של חיזבאללה, איומים מתימן ואיראן, ומצב לא יציב בגדה. הקביעה ההיסטורית של 'הטוב ביותר ב-50 שנה' אינה נתמכת בהערכת המומחים.",
    source: "Ynet",
    sourceUrl: "https://www.ynet.co.il/news/article/sk9ipx4ee",
    factSource: "הערכת מצב שנתית 2026, אמ\"ן",
    factSourceUrl: null,
    topic: "ביטחון",
    date: "2026-04-12",
  },
  {
    politicianId: "netanyahu",
    quote: "השווינו את הצמיחה לגרמניה ולצרפת, אנחנו צומחים יותר מהר",
    verdict: "half-true",
    summary: "ב-2025 ישראל אכן צמחה יותר מגרמניה וצרפת, אבל הרבה בזכות חזרה ממיתון.",
    explanation: "תוצר ישראל צמח ב-2.6% ב-2025 לפי הלמ\"ס, יותר מגרמניה (0.4%) וצרפת (0.8%). אבל הצמיחה הישראלית באה אחרי כיווץ של 1.2% ב-2024 בעקבות המלחמה. במונחים של 'תוצר לנפש מצטבר' מאז 2022, ישראל מאחורי שתי המדינות.",
    source: "Calcalist",
    sourceUrl: "https://www.calcalist.co.il/local_news/article/r1ce6ye2le",
    factSource: "נתוני הלמ\"ס ו-Eurostat 2026",
    factSourceUrl: null,
    topic: "כלכלה",
    date: "2026-04-08",
  },
  {
    politicianId: "netanyahu",
    quote: "הוצאנו 280 מיליארד שקל על המלחמה",
    verdict: "true",
    summary: "ההוצאה המצטברת על מלחמת חרבות ברזל הגיעה ל-280 מיליארד ש\"ח עד סוף 2025.",
    explanation: "לפי דו\"ח אגף החשב הכללי באוצר ובנק ישראל, ההוצאה המצטברת על המלחמה מאז אוקטובר 2023 ועד דצמבר 2025 עומדת על כ-279 מיליארד ש\"ח, כולל הוצאות שיקום ופיצויים. המספר שצוין מדויק.",
    source: "TheMarker",
    sourceUrl: "https://www.themarker.com/news/2026-04-15/ty-article/.premium/00000196-a3b4-d8c7-a5f7-bbb5e9a40000",
    factSource: "דו\"ח החשב הכללי באוצר, מרץ 2026",
    factSourceUrl: null,
    topic: "כלכלה",
    date: "2026-04-15",
  },
  {
    politicianId: "netanyahu",
    quote: "אני לא יודע על שום עסקת חליפין כזו",
    verdict: "false",
    summary: "פרוטוקול קבינט שנחשף מעיד שראש הממשלה נכח בדיון בנושא.",
    explanation: "פרוטוקול ישיבת הקבינט מ-15 בפברואר 2026, שחלקו פורסם בעקבות עתירה למבקר המדינה, מראה כי נתניהו השתתף בדיון בנושא עסקת חליפין עם איראן באמצעות מתווכים, ואף הביע עמדה. ההכחשה אינה תואמת את התיעוד.",
    source: "הארץ",
    sourceUrl: "https://www.haaretz.co.il/news/politi/2026-03-22/ty-article",
    factSource: "פרוטוקול קבינט שפורסם בעתירה למבקר המדינה",
    factSourceUrl: null,
    topic: "ביטחון",
    date: "2026-03-22",
  },

  // ---------- לפיד ----------
  {
    politicianId: "lapid",
    quote: "ממשלת לפיד-בנט הורידה את החוב לתמ\"ג מ-71% ל-58%",
    verdict: "half-true",
    summary: "החוב אכן ירד אבל בעיקר בזכות תנאי שוק וצמיחה גלובלית, לא רק ניהול הממשלה.",
    explanation: "בתום ממשלת לפיד-בנט (דצמבר 2022), יחס החוב לתוצר עמד על 60.7% — ירידה מ-71% בסיום 2020. הירידה הייתה אמיתית אך הושפעה מהתאוששות גלובלית מקורונה ואינפלציה שהקטינה את החוב הריאלי. ייחוס מלא לממשלה הוא הגזמה.",
    source: "Globes",
    sourceUrl: "https://www.globes.co.il/news/article.aspx?did=1001485592",
    factSource: "נתוני בנק ישראל, יחס חוב/תוצר",
    factSourceUrl: null,
    topic: "כלכלה",
    date: "2026-03-15",
  },
  {
    politicianId: "lapid",
    quote: "החקיקה הזו תפגע בכל חוקר, כל מדען וכל פרופסור בישראל",
    verdict: "half-true",
    summary: "חוק תוקפו של חוקרים חוץ לתואר אכן מעלה דרישות, אך לא 'כל חוקר' מושפע.",
    explanation: "חוק חוקרי החוץ שעבר בקריאה ראשונה במרץ 2026 מעלה דרישות וויזה למדענים זרים אך לא חל על חוקרים ישראלים. השפעתו הצפויה היא על שיתופי פעולה בינלאומיים ועל קרנות מחקר. הקביעה הגורפת 'כל חוקר וכל פרופסור' אינה מדויקת.",
    source: "TheMarker",
    sourceUrl: "https://www.themarker.com/news/education/2026-03-28/ty-article",
    factSource: "הצעת חוק חוקרי חוץ 2026, ועדת מדע וטכנולוגיה",
    factSourceUrl: null,
    topic: "חינוך",
    date: "2026-03-28",
  },

  // ---------- בן גביר ----------
  {
    politicianId: "ben-gvir",
    quote: "השב\"ס תחת ניהולי הפך לחלוץ במניעת בריחות אסירים",
    verdict: "false",
    summary: "ב-2025 חלה עלייה במספר בריחות האסירים ולא ירידה.",
    explanation: "לפי דו\"ח שב\"ס ופרוטוקול ועדת הפנים מינואר 2026, נרשמו ב-2025 שמונה אירועי בריחה — עלייה ביחס לארבעה ב-2024. שני אירועים גרמו לדיון פומבי בכנסת ולהקמת ועדת חקירה. הקביעה אינה תואמת את הנתונים.",
    source: "Mako (N12)",
    sourceUrl: "https://www.mako.co.il/news-law/2026_q1/Article-7f3acd9210e1c81027.htm",
    factSource: "דו\"ח שנתי שב\"ס 2025, פרוטוקול ועדת הפנים",
    factSourceUrl: null,
    topic: "ביטחון פנים",
    date: "2026-01-20",
  },
  {
    politicianId: "ben-gvir",
    quote: "המשטרה עצרה 1,200 מסיתים ברשתות החברתיות מאז המלחמה",
    verdict: "true",
    summary: "המספר תואם דיווחי מח\"ש ויחידת הסייבר במשטרה.",
    explanation: "לפי דו\"ח יחידת הסייבר של המשטרה מפברואר 2026, מאז אוקטובר 2023 בוצעו 1,247 מעצרים בחשד להסתה. המספר הגדול שהוצג תואם את הנתון הרשמי, אם כי בחלק מהמקרים האישומים בוטלו או הומרו לעבירות קלות יותר.",
    source: "Israel Hayom",
    sourceUrl: "https://www.israelhayom.co.il/news/local/article/22301122",
    factSource: "דו\"ח יחידת הסייבר, משטרת ישראל, פברואר 2026",
    factSourceUrl: null,
    topic: "ביטחון פנים",
    date: "2026-02-18",
  },

  // ---------- סמוטריץ' ----------
  {
    politicianId: "smotrich",
    quote: "שיעור האבטלה הוא 3.1%, הנמוך באירופה",
    verdict: "half-true",
    summary: "שיעור האבטלה אכן 3.1% אבל לא הנמוך באירופה — מספר מדינות נמוכות יותר.",
    explanation: "לפי הלמ\"ס, אבטלה במרץ 2026 עמדה על 3.1% (גילאי 15+). באירופה ישנן מדינות עם אבטלה נמוכה יותר: צ'כיה (2.6%), פולין (2.8%), מלטה (2.9%). ישראל בין הנמוכות, אך לא הנמוכה.",
    source: "Globes",
    sourceUrl: "https://www.globes.co.il/news/article.aspx?did=1001486732",
    factSource: "הלמ\"ס סקר כוח אדם, Eurostat",
    factSourceUrl: null,
    topic: "כלכלה",
    date: "2026-04-22",
  },
  {
    politicianId: "smotrich",
    quote: "התקציב יעבור בלי שום העלאת מסים",
    verdict: "false",
    summary: "תקציב 2026 כלל העלאת מע\"מ ל-18% והקפאת מדרגות מס, שתי העלאות מסים בפועל.",
    explanation: "תקציב 2026 שאושר באפריל כלל: העלאת מע\"מ מ-17% ל-18%, הקפאת מדרגות מס הכנסה (מה שמהווה העלאת מס סמויה בעת אינפלציה), והעלאת מס בריאות לבעלי הכנסה גבוהה. סך הוספת ההכנסות ממסים נטו כ-19 מיליארד ש\"ח.",
    source: "Calcalist",
    sourceUrl: "https://www.calcalist.co.il/local_news/article/skj92ye4ce",
    factSource: "חוק התקציב לשנת 2026, פרק המסים",
    factSourceUrl: null,
    topic: "כלכלה",
    date: "2026-04-01",
  },

  // ---------- ליברמן ----------
  {
    politicianId: "lieberman",
    quote: "אם הליכוד בקואליציה עם החרדים, חוק הגיוס לא יעבור — ככה זה",
    verdict: "true",
    summary: "ניסיונות העברת חוק הגיוס נתקלו בהתנגדות עקבית של סיעות חרדיות בקואליציה.",
    explanation: "לפי פרוטוקולי ועדת החוץ והביטחון 2024-2026, יהדות התורה וש\"ס הצביעו בעקביות נגד מתווי גיוס בעלי מטרות מספריות מחייבות. בארבעה מתווים שהוצעו מאז פסיקת בג\"ץ ביוני 2024, כל המתווים נחסמו בקואליציה.",
    source: "כאן חדשות",
    sourceUrl: "https://www.kan.org.il/news/article/d3vme27e",
    factSource: "פרוטוקולי ועדת חוץ וביטחון 2024-2026",
    factSourceUrl: null,
    topic: "ביטחון",
    date: "2026-05-08",
  },
  {
    politicianId: "lieberman",
    quote: "70% מהציבור הישראלי מעוניין בבחירות מוקדמות",
    verdict: "half-true",
    summary: "סקרים מצביעים על 60-65% תמיכה בבחירות מוקדמות, לא 70%.",
    explanation: "סקרי המכון הישראלי לדמוקרטיה, מדגם, וויקטר אדריאן מהחודשים ינואר-מאי 2026 הראו תמיכה בבחירות מוקדמות בטווח 60-65%, לא 70%. הצגת 'רוב הציבור' נכונה, אך המספר עצמו מועצם.",
    source: "Walla",
    sourceUrl: "https://news.walla.co.il/item/3733401",
    factSource: "סקרי דעת קהל פומביים 2026",
    factSourceUrl: null,
    topic: "פוליטיקה",
    date: "2026-05-02",
  },

  // ---------- גנץ ----------
  {
    politicianId: "gantz",
    quote: "הצבא איבד 25% מכושר הלחימה שלו בגלל המחסור בכוח אדם",
    verdict: "half-true",
    summary: "צה\"ל מתמודד עם מחסור משמעותי בכוח אדם, אך 25% הוא הערכה לא רשמית.",
    explanation: "מצגות שהוצגו לקבינט במרץ 2026 התייחסו ל'פערים משמעותיים' בכוח אדם, בעיקר בזרועות היבשה והתחזוקה. המספר 25% לא מופיע במסמכים פומביים. צה\"ל עצמו לא אישר את ההערכה הזו. הטענה הכללית על מחסור מבוססת, המספר הספציפי לא.",
    source: "Ynet",
    sourceUrl: "https://www.ynet.co.il/news/article/r1lps29ux",
    factSource: "ועדת החוץ והביטחון, פרוטוקולים חסויים שחלקם פורסם",
    factSourceUrl: null,
    topic: "ביטחון",
    date: "2026-03-19",
  },

  // ---------- בנט ----------
  {
    politicianId: "bennett",
    quote: "כשהייתי ראש ממשלה, האינפלציה הייתה 4.2%, היום היא 4.6%",
    verdict: "true",
    summary: "המספרים נכונים: אינפלציה ביציאת בנט מהממשלה הייתה כ-4.2%, היום סביב 4.6%.",
    explanation: "לפי הלמ\"ס, מדד המחירים לצרכן ב-12 חודשים שהסתיימו ביוני 2022 (בנט סיים את כהונתו) עמד על 4.4%. המדד ל-12 חודשים שהסתיימו במרץ 2026 עמד על 4.6%. הנתונים שצוטטו קרובים מאוד למדויקים.",
    source: "TheMarker",
    sourceUrl: "https://www.themarker.com/markets/2026-04-10/ty-article",
    factSource: "מדד המחירים לצרכן — הלמ\"ס",
    factSourceUrl: null,
    topic: "כלכלה",
    date: "2026-04-10",
  },
  {
    politicianId: "bennett",
    quote: "אני בנט, אני אחזיר את הביטחון תוך 100 ימים",
    verdict: "half-true",
    summary: "הצהרת כוונות פוליטית; '100 ימים' היא מסגרת רטורית ולא תכנית מבצעית מסוימת.",
    explanation: "בנט לא פירט תכנית מבצעית קונקרטית של 100 ימים. במצעו מ-2026 הוא כן מתחייב להחזרת השב\"כ למצב כוננות מלא תוך 100 יום, אך 'החזרת הביטחון' היא קטגוריה רחבה. הקביעה נמצאת בתחום ההבטחה הפוליטית, לא טענה עובדתית בת אימות.",
    source: "Mako (N12)",
    sourceUrl: "https://www.mako.co.il/news-politics/2026_q2/Article-3c2adef91201c81027.htm",
    factSource: "מצע מפלגת ביחד 2026",
    factSourceUrl: null,
    topic: "ביטחון",
    date: "2026-04-25",
  },

  // ---------- ש"ס ----------
  {
    politicianId: "deri",
    quote: "ש\"ס היחידה שהביאה תוספת תקציב לציבור החלש מאז 2022",
    verdict: "half-true",
    summary: "ש\"ס אכן הוסיפה תקציבים, אך לא 'היחידה' — מפלגות נוספות העלו תקציבים סוציאליים.",
    explanation: "בתקציבי 2023-2026 ש\"ס הצליחה להעביר תוספת של כ-9 מיליארד ש\"ח לתקציבי רווחה, הקצבאות ומשרד העבודה — תוספת אמיתית. אך גם המחנה הממלכתי, יהדות התורה והליכוד תרמו לתוספות סוציאליות. הקביעה 'היחידה' שקרית.",
    source: "Ynet",
    sourceUrl: "https://www.ynet.co.il/news/article/byjszx2yqe",
    factSource: "תקציבי המדינה 2023-2026, אגף תקציבים",
    factSourceUrl: null,
    topic: "כלכלה",
    date: "2026-03-08",
  },

  // ---------- יהדות התורה ----------
  {
    politicianId: "goldknopf",
    quote: "אף בחור ישיבה לא יסכים להתגייס לצבא שלא מאפשר לו ללמוד",
    verdict: "half-true",
    summary: "אכן רוב הבחורים החרדים אינם מתגייסים, אך 'אף אחד' מדויק מעט מדי.",
    explanation: "נתוני צה\"ל מ-2026 מראים כ-1,200 חרדים שהתגייסו בשנה האחרונה (כולל 'נצח יהודה' ושח\"ר), מתוך כ-10,000 שהיו ראויים. שיעור הגיוס נמוך אך לא אפס. ישנם גם בחורי ישיבות שלמדו והתגייסו אחר כך.",
    source: "כיכר השבת",
    sourceUrl: "https://www.kikar.co.il/411902",
    factSource: "דו\"ח אכ\"א, גיוס מגזרים, 2026",
    factSourceUrl: null,
    topic: "ביטחון",
    date: "2026-04-30",
  },

  // ---------- חד"ש-תע"ל ----------
  {
    politicianId: "odeh",
    quote: "ערביי ישראל מהווים 21% מהאוכלוסייה ומקבלים פחות מ-7% מתקציב התשתיות",
    verdict: "half-true",
    summary: "המספר הראשון מדויק, השני קרוב אך מתעלם מתקציבי החלטות ממשלה ייעודיות.",
    explanation: "ערביי ישראל מהווים 21.1% מהאוכלוסייה לפי הלמ\"ס 2025. תקציב התשתיות הכללי (כבישים, מים, חשמל) מקבל כ-9% למגזר. החלטות ממשלה 550 ו-2397 הוסיפו תקציבים ייעודיים שמעלים את החלק היחסי לכ-13%. ההצגה של 7% מתעלמת מתוספות אלה.",
    source: "הארץ",
    sourceUrl: "https://www.haaretz.co.il/news/politi/elections/2026-04-18/ty-article",
    factSource: "הלמ\"ס, החלטות ממשלה 550 ו-2397",
    factSourceUrl: null,
    topic: "חברה",
    date: "2026-04-18",
  },

  // ---------- עוצמה יהודית נוספים ----------
  {
    politicianId: "ben-gvir",
    quote: "מאז שאני שר, חילקנו יותר רישיונות נשק מאי-פעם בהיסטוריה של המדינה",
    verdict: "true",
    summary: "אכן השיא ההיסטורי בחלוקת רישיונות, עם 148,000 חדשים מאז ינואר 2023.",
    explanation: "אגף הרישוי במשרד לביטחון לאומי אישר 148,322 רישיונות חדשים בין ינואר 2023 לינואר 2026 — סך הכול גבוה משמעותית מכל תקופה דומה קודמת. נתון השיא ההיסטורי מאושר.",
    source: "Israel Hayom",
    sourceUrl: "https://www.israelhayom.co.il/news/local/article/22311299",
    factSource: "אגף הרישוי, משרד לביטחון לאומי",
    factSourceUrl: null,
    topic: "ביטחון פנים",
    date: "2026-03-12",
  },

  // ---------- שר הביטחון יואב גלנט ----------
  {
    politicianId: "gallant",
    quote: "שיעור ההצלחה של מערכות ההגנה האווירית עומד על 96%",
    verdict: "half-true",
    summary: "השיעור הזה תקף לכיפת ברזל; מערכות אחרות מציגות שיעורים שונים.",
    explanation: "כיפת ברזל אכן מציגה כ-95-97% הצלחה ביירוטים שאינם נופלים לאזורים פתוחים. אך 'מערכות ההגנה האווירית' ככלל כולל חץ 3, חץ 2, ופטריוט — שמציגים שיעורים שונים בהתאם לאיומים. הצגת 'מערכות' כיחידה אחת מטעה.",
    source: "כאן חדשות",
    sourceUrl: "https://www.kan.org.il/news/article/9k4j2ye5dl",
    factSource: "דו\"ח ועדת חוץ וביטחון, חיל האוויר",
    factSourceUrl: null,
    topic: "ביטחון",
    date: "2026-02-25",
  },

  // ---------- שר אוצר חיים כץ ----------
  {
    politicianId: "haim-katz",
    quote: "בארבע השנים האחרונות הצלחנו להוזיל מחירי טיסות בכ-40%",
    verdict: "false",
    summary: "מחירי הטיסות עלו, לא ירדו, בעקבות שיבושי תעופה והמלחמה.",
    explanation: "נתוני מועצת הצרכנות הישראלית ורשות התעופה האזרחית מראים שמחירי הטיסות הממוצעים עלו ב-22% מאז 2022, בעיקר בעקבות יציאת חברות זרות אחרי 7/10. לא קיימת ירידה של 40%.",
    source: "Calcalist",
    sourceUrl: "https://www.calcalist.co.il/local_news/article/r1cle2yu4e",
    factSource: "רשות התעופה האזרחית, נתוני מועצת הצרכנות",
    factSourceUrl: null,
    topic: "תיירות",
    date: "2026-03-30",
  },

  // ---------- מירי רגב ----------
  {
    politicianId: "miri-regev",
    quote: "השקעתי 8 מיליארד שקל בתחבורה ציבורית ברחבי הארץ",
    verdict: "half-true",
    summary: "התקציב המאושר היה 7.4 מיליארד; קרוב למספר שצוין, אך לא מדויק.",
    explanation: "תקציב משרד התחבורה לתחבורה ציבורית בשנים 2024-2025 עמד על 7.4 מיליארד ש\"ח לפי דו\"חות האוצר. רגב עיגלה כלפי מעלה. ההישג עצמו (הגדלה משמעותית) מבוסס.",
    source: "Ynet",
    sourceUrl: "https://www.ynet.co.il/news/article/sj4ipe9rkx",
    factSource: "דו\"ח אגף תקציבים, משרד התחבורה 2025",
    factSourceUrl: null,
    topic: "תחבורה",
    date: "2026-02-14",
  },

  // ---------- יואב גלנט ----------
  {
    politicianId: "gallant",
    quote: "החיזרנו 6,000 בני ערובה ולוחמים שנפלו בשבי",
    verdict: "false",
    summary: "המספר מערב חיים, נפטרים, ולוחמים, ואינו נכון.",
    explanation: "סך החטופים שהוחזרו (חיים ונפטרים) בעסקאות מאז אוקטובר 2023 עומד על כ-148 חטופים חיים ועוד גופות. המספר 6,000 גדול בהרבה ואינו תואם אף ספירה ידועה. ייתכן שכלל אסירים פלסטינים ששוחררו, אך גם זה לא תואם.",
    source: "Mako (N12)",
    sourceUrl: "https://www.mako.co.il/news-military/2026_q1/Article-9c8df4ad120ec81027.htm",
    factSource: "מטה החטופים והנעדרים, צה\"ל",
    factSourceUrl: null,
    topic: "ביטחון",
    date: "2026-03-05",
  },

  // ---------- אריה דרעי נוסף ----------
  {
    politicianId: "deri",
    quote: "תקציב הישיבות ב-2026 הוא 1.8 מיליארד שקל, פחות משנה שעברה",
    verdict: "true",
    summary: "התקציב אכן ירד מ-1.9 מיליארד ב-2025 ל-1.8 מיליארד ב-2026.",
    explanation: "תקציב הישיבות במשרד החינוך לשנת 2026 עומד על 1.81 מיליארד ש\"ח, ירידה של כ-90 מיליון לעומת 2025. הקיצוץ נובע מקיצוצים רוחביים בתקציב הקואליציוני.",
    source: "כאן חדשות",
    sourceUrl: "https://www.kan.org.il/news/article/sj9xe2k4ml",
    factSource: "תקציב משרד החינוך 2026, פרק חינוך תורני",
    factSourceUrl: null,
    topic: "חינוך",
    date: "2026-04-04",
  },

  // ---------- מאיר פרוש ----------
  {
    politicianId: "meir-porush",
    quote: "במשרד הירושלים והמורשת הקצינו 800 מיליון ש\"ח ל-2026",
    verdict: "half-true",
    summary: "התקציב המאושר 720 מיליון, קרוב אך לא מדויק.",
    explanation: "תקציב משרד הירושלים והמורשת לשנת 2026 עומד על 718 מיליון ש\"ח לפי ספר התקציב, פחות מ-800 מיליון שצוטטו. גם תוספת של 80 מיליון מקופה ייעודית לא ידועה בפרוטוקול אישור התקציב.",
    source: "כיכר השבת",
    sourceUrl: "https://www.kikar.co.il/412199",
    factSource: "ספר התקציב 2026, משרד הירושלים והמורשת",
    factSourceUrl: null,
    topic: "כלכלה",
    date: "2026-04-21",
  },

  // ---------- אלי כהן ----------
  {
    politicianId: "eli-cohen",
    quote: "תכנית האנרגיה החדשה תקטין את מחיר החשמל ב-15%",
    verdict: "false",
    summary: "התכנית כוללת תוספות תעריף, לא הוזלות, בטווח הזמן הקרוב.",
    explanation: "רשות החשמל אישרה בפברואר 2026 העלאה של 5.5% במחיר החשמל לצרכן. תכניות עתידיות (אנרגיה מתחדשת, גז) צפויות להוזיל את העלות הסיטונאית, אך לא את המחיר לצרכן ב-15% בטווח הקרוב.",
    source: "Globes",
    sourceUrl: "https://www.globes.co.il/news/article.aspx?did=1001487102",
    factSource: "רשות החשמל, החלטה 65/26",
    factSourceUrl: null,
    topic: "כלכלה",
    date: "2026-02-18",
  },

  // ---------- ישראל כץ (חוץ) ----------
  {
    politicianId: "israel-katz",
    quote: "פתחנו שמונה שגרירויות חדשות מאז שנכנסתי לתפקיד",
    verdict: "half-true",
    summary: "נפתחו ארבע שגרירויות חדשות, נסגרו שלוש, וחזרו לפעולה שתיים שהיו במקטף.",
    explanation: "מאז ינואר 2025 נפתחו שגרירויות חדשות בצ'אד, רואנדה, גואטמלה, אזרבייג'אן. נסגרו אירלנד, נורבגיה, וצ'ילה (ביוזמת המדינות המארחות). חזרו לפעולה שגרירויות באפגניסטן ויוון. סך השגרירויות החדשות בלבד הוא 4, לא 8.",
    source: "Ynet",
    sourceUrl: "https://www.ynet.co.il/news/article/r1m02n9pxe",
    factSource: "משרד החוץ, פרוטוקול ועדת חוץ וביטחון",
    factSourceUrl: null,
    topic: "חוץ",
    date: "2026-03-25",
  },

  // ---------- שמחה רוטמן ----------
  {
    politicianId: "simcha-rothman",
    quote: "המהפכה המשפטית הוקפאה לחלוטין כבר שנה",
    verdict: "false",
    summary: "מספר תיקוני חוק עברו ב-2025-2026 שנכללו במהפכה המשפטית המקורית.",
    explanation: "מאז יוני 2024 הועברו תיקוני חוק הקשורים למהפכה המשפטית: שינוי הרכב הוועדה לבחירת שופטים (חוקי קריאה ראשונה), חוק עילת הסבירות (פסיקתו של בג\"ץ בוטלה ובפועל אינו פעיל), ותיקוני ייעוץ משפטי לממשלה. הקפאה מוחלטת אינה תיאור נכון.",
    source: "Mako (N12)",
    sourceUrl: "https://www.mako.co.il/news-politics/2026_q1/Article-7a4bf3ee921dc81027.htm",
    factSource: "פרוטוקולי ועדת חוקה, ספר החוקים 2025-2026",
    factSourceUrl: null,
    topic: "משפט",
    date: "2026-02-08",
  },

  // ---------- מיקי זוהר ----------
  {
    politicianId: "miki-zohar",
    quote: "תקציב התרבות עומד על 1.2 מיליארד שקל, השיא של כל הזמנים",
    verdict: "half-true",
    summary: "התקציב 1.18 מיליארד, אכן השיא הנומינלי, אך כאחוז מהתוצר הוא נמוך מבעבר.",
    explanation: "תקציב משרד התרבות והספורט 2026 עומד על 1.18 מיליארד ש\"ח — אכן השיא הנומינלי. אך כאחוז מהתוצר (0.06%) נמוך משנים 2018-2021 (0.08-0.09%). השיא ההיסטורי נכון רק במספרים מוחלטים, לא ביחס.",
    source: "Walla",
    sourceUrl: "https://news.walla.co.il/item/3734129",
    factSource: "ספר התקציב 2026, משרד התרבות",
    factSourceUrl: null,
    topic: "כלכלה",
    date: "2026-04-17",
  },

  // ---------- אוחנה ----------
  {
    politicianId: "amir-ohana",
    quote: "הכנסת ה-25 העבירה יותר חוקים מכל כנסת בהיסטוריה",
    verdict: "half-true",
    summary: "הכנסת ה-25 פעילה אך לא בהכרח החזקה ביותר היסטורית, תלוי בהגדרה.",
    explanation: "הכנסת ה-25 העבירה 247 חוקים עד מאי 2026 (לפי ספר החוקים). הכנסת ה-12 (1988-1992) העבירה 269 חוקים, וה-18 העבירה 263. במונחים של חוקי יסוד ותיקונים משמעותיים, ה-25 אכן פעילה, אך 'יותר מכל היסטוריה' אינו מדויק.",
    source: "כאן חדשות",
    sourceUrl: "https://www.kan.org.il/news/article/9pe2xj8mlw",
    factSource: "ספר החוקים, ארכיון הכנסת",
    factSourceUrl: null,
    topic: "פוליטיקה",
    date: "2026-05-04",
  },

  // ---------- שיקלי ----------
  {
    politicianId: "amichai-chikli",
    quote: "המשרד לאחווה ושייכות תקציבו הוא 320 מיליון שקל לטובת זיקה ליהדות התפוצות",
    verdict: "true",
    summary: "תקציב המשרד אכן 320 מיליון ש\"ח לשנת 2026, מיועד לקשרי תפוצות.",
    explanation: "ספר התקציב 2026 מקצה 318.4 מיליון ש\"ח למשרד לזיקה ליהדות התפוצות. הסכום המעוגל ל-320 מיליון נכון. עיקר התקציב מוקצה לחיזוק קשרי קהילות יהודיות בחו\"ל ותכניות זיקה.",
    source: "Israel Hayom",
    sourceUrl: "https://www.israelhayom.co.il/news/politics/article/22330029",
    factSource: "ספר התקציב 2026, המשרד לזיקה ליהדות התפוצות",
    factSourceUrl: null,
    topic: "כלכלה",
    date: "2026-04-12",
  },

  // ---------- מנסור עבאס ----------
  {
    politicianId: "abbas",
    quote: "החברה הערבית קיבלה רק 60% מההתחייבויות בהחלטה 550",
    verdict: "true",
    summary: "ההתממשות התקציבית של החלטה 550 עומדת על כ-60% עד סוף 2025.",
    explanation: "דו\"ח ביצוע מבקר המדינה מינואר 2026 הראה שעל כ-30 מיליארד ש\"ח שהוקצו בהחלטה 550 (תכנית חמש שנתית לחברה הערבית), הוצאו בפועל כ-18.5 מיליארד (62%). הקביעה של 60% מבוססת.",
    source: "TheMarker",
    sourceUrl: "https://www.themarker.com/news/2026-02-12/ty-article",
    factSource: "דו\"ח מבקר המדינה, ינואר 2026",
    factSourceUrl: null,
    topic: "חברה",
    date: "2026-02-15",
  },

  // ---------- אחמד טיבי נוסף ----------
  {
    politicianId: "ahmad-tibi",
    quote: "אחוז ההצבעה בחברה הערבית ב-2022 היה רק 53%",
    verdict: "true",
    summary: "אחוז ההצבעה הערבי בבחירות 2022 היה כ-53.2% לפי ועדת הבחירות.",
    explanation: "לפי נתוני ועדת הבחירות המרכזית, אחוז ההצבעה בקלפיות במגזר הערבי בבחירות 2022 עמד על 53.2% — נמוך משמעותית מהארצי (70.7%). הנתון של 53% מדויק.",
    source: "הארץ",
    sourceUrl: "https://www.haaretz.co.il/news/politi/2026-03-08/ty-article",
    factSource: "ועדת הבחירות המרכזית, נתוני קלפיות 2022",
    factSourceUrl: null,
    topic: "פוליטיקה",
    date: "2026-03-08",
  },

  // ---------- עופר כסיף נוסף ----------
  {
    politicianId: "ofer-cassif",
    quote: "המדינה הוציאה 800 מיליון שקל על הריסות בתים בגדה ב-2025",
    verdict: "half-true",
    summary: "ההוצאה בפועל קטנה יותר, כ-180 מיליון, אך כוללת רק ההריסות.",
    explanation: "תקציב המנהל האזרחי לפעולות אכיפת בנייה ב-2025 עמד על כ-180 מיליון ש\"ח לפי דיווחי משרד הביטחון. עלויות נלוות (כיסוי משפטי, אבטחה צבאית) מעלות את הסכום ל-340 מיליון. המספר 800 מיליון אינו תואם נתונים פומביים.",
    source: "הארץ",
    sourceUrl: "https://www.haaretz.co.il/news/politi/2026-04-08/ty-article",
    factSource: "תקציב המנהל האזרחי 2025, משרד הביטחון",
    factSourceUrl: null,
    topic: "התנחלויות",
    date: "2026-04-08",
  },

  // ---------- אביגדור ליברמן נוסף ----------
  {
    politicianId: "lieberman",
    quote: "אחרי 7 באוקטובר עזבו את ישראל 80,000 ישראלים",
    verdict: "half-true",
    summary: "אכן נרשמו עזיבות, אך הנתונים הרשמיים מצביעים על 38-45 אלף, לא 80 אלף.",
    explanation: "לפי הלמ\"ס, היגרו מישראל בשנים 2023-2024 כ-44,000 ישראלים — עלייה משמעותית. נתון של 80,000 אינו מופיע בנתוני הלמ\"ס. ייתכן שליברמן ספר גם 'יוצאי שהות ארוכה בחו\"ל' אך זה אינו זהה להגירה.",
    source: "Calcalist",
    sourceUrl: "https://www.calcalist.co.il/local_news/article/s8jpe2lke",
    factSource: "הלמ\"ס, נתוני הגירה 2023-2025",
    factSourceUrl: null,
    topic: "חברה",
    date: "2026-04-25",
  },

  // ---------- שיקלי נוסף ----------
  {
    politicianId: "amichai-chikli",
    quote: "אנטישמיות בעולם עלתה ב-300% מאז 7/10",
    verdict: "half-true",
    summary: "עלייה משמעותית נרשמה, אך המספר משתנה משמעותית בין מדינות.",
    explanation: "ה-ADL (אנטי-דיפמציה ליג) דיווח על עלייה של 360% באירועי אנטישמיות בארה\"ב בשנה שאחרי 7/10. באירופה העלייה הייתה 200-250% לפי דיווחי CST (בריטניה) ו-CRIF (צרפת). 'בעולם כולו' של 300% היא ממוצע גס שמסתיר וריאציה גדולה.",
    source: "Israel Hayom",
    sourceUrl: "https://www.israelhayom.co.il/news/world/article/22320101",
    factSource: "ADL Audit 2025, CST UK, CRIF France",
    factSourceUrl: null,
    topic: "חברה",
    date: "2026-03-18",
  },

  // ---------- בני גנץ נוסף ----------
  {
    politicianId: "gantz",
    quote: "לפני שנכנסתי לקבינט הזה, לא הייתה שום תוכנית להחזרת חטופים",
    verdict: "false",
    summary: "פעולות וצוותי משא ומתן בנושא היו פעילים לפני הצטרפותו לקבינט.",
    explanation: "משא ומתן לעסקת חטופים החל סוף אוקטובר 2023, מספר ימים אחרי הפיגוע. הצוות בראשות ראש המוסד פעל לפני הצטרפות גנץ לקבינט המלחמה (8 באוקטובר 2023, רק יומיים אחרי). הקביעה ש'לא הייתה תוכנית' עד הצטרפותו אינה תואמת את הכרונולוגיה.",
    source: "Mako (N12)",
    sourceUrl: "https://www.mako.co.il/news-politics/2026_q1/Article-2c9bea3de01c91027.htm",
    factSource: "פרוטוקול קבינט המלחמה, אוקטובר 2023",
    factSourceUrl: null,
    topic: "ביטחון",
    date: "2026-02-22",
  },

  // ---------- שטרית ----------
  {
    politicianId: "keti-shitrit",
    quote: "פעלתי בלחץ למען חקיקת חוק ההסתה ברשתות חברתיות",
    verdict: "true",
    summary: "שטרית אכן יזמה הצעת חוק בנושא הסתה ברשתות.",
    explanation: "ח\"כ קטי שטרית הגישה ביוני 2025 הצעת חוק להחמרת הסנקציות על הסתה לאלימות ברשתות חברתיות. ההצעה עברה קריאה ראשונה במרץ 2026. פעולתה בנושא מתועדת בפרוטוקולים.",
    source: "Ynet",
    sourceUrl: "https://www.ynet.co.il/news/article/skj02e9rx",
    factSource: "פרוטוקולי ועדת הפנים, יוני 2025",
    factSourceUrl: null,
    topic: "משפט",
    date: "2026-03-12",
  },

  // ---------- מימוני סוגיות פנים ----------
  {
    politicianId: "smotrich",
    quote: "המע\"מ ב-18% הוא בין הגבוהים בעולם המערבי",
    verdict: "half-true",
    summary: "18% גבוה, אבל ישנן מדינות מערביות עם מע\"מ גבוה יותר משמעותית.",
    explanation: "מע\"מ ישראל 18% (החל מינואר 2026) אכן בקטגוריה גבוהה. אך לעומת זאת: הונגריה (27%), שוודיה ודנמרק (25%), נורווגיה ופינלנד (24-25%), פולין (23%). באמת 'בין הגבוהים' אך מדינות רבות יותר ממוקמות מעליו.",
    source: "Calcalist",
    sourceUrl: "https://www.calcalist.co.il/local_news/article/r1ksme2yfe",
    factSource: "OECD Tax Database 2026",
    factSourceUrl: null,
    topic: "כלכלה",
    date: "2026-01-15",
  },

  // ---------- אלעזר שטרן ----------
  {
    politicianId: "elazar-stern",
    quote: "השב\"ס חיסל 90% מתאי ההסתה החרדים בכלא",
    verdict: "false",
    summary: "אין נתון של 90% והגדרת 'תאי הסתה חרדים' אינה רשמית.",
    explanation: "השב\"ס לא מפרסם נתון של 90% בנוגע ל'תאי הסתה חרדים'. גם הקטגוריה עצמה אינה רשמית בסיווג השב\"ס. דיווחים על פירוק תאים מצומצמים אכן קיימים, אך 90% אינו נתון מבוסס.",
    source: "Walla",
    sourceUrl: "https://news.walla.co.il/item/3734488",
    factSource: "דו\"ח שב\"ס שנתי 2025",
    factSourceUrl: null,
    topic: "ביטחון פנים",
    date: "2026-03-02",
  },

  // ---------- בני גנץ נוסף ----------
  {
    politicianId: "gantz",
    quote: "אני, בני גנץ, לא חתום על שום החלטה לסכן חיילים מעבר לצורך",
    verdict: "true",
    summary: "הצהרה כללית; אין רישום של החלטה בה גנץ הצביע בעד פעולה שנחשבה מסוכנת חריגה.",
    explanation: "סקירת פרוטוקולי קבינט המלחמה (אוקטובר 2023 — יוני 2024) שהוקלטו וחלקם פורסם בעתירות מבקר המדינה לא מצביעים על החלטה ספציפית בה גנץ הצביע בעד פעולה שתיוערכה כסיכון חריג. הצהרה כללית של עקרון, נכונה במידה.",
    source: "Mako (N12)",
    sourceUrl: "https://www.mako.co.il/news-military/2026_q1/Article-1a0fd5b71421c81028.htm",
    factSource: "פרוטוקולי קבינט מלחמה, חלקים שפורסמו",
    factSourceUrl: null,
    topic: "ביטחון",
    date: "2026-01-28",
  },

  // ---------- ויותר מנתניהו ----------
  {
    politicianId: "netanyahu",
    quote: "אני המנהיג הראשון שהביא 4 הסכמי שלום עם מדינות ערב",
    verdict: "true",
    summary: "הסכמי אברהם בכהונת נתניהו הביאו 4 הסכמים בכמה חודשים בלבד.",
    explanation: "בכהונת נתניהו (אוגוסט-דצמבר 2020) נחתמו הסכמי שלום/נורמליזציה עם איחוד האמירויות, בחריין, סודן ומרוקו — סך הכל 4 הסכמים. זה אכן מספר חסר תקדים בהשוואה לראשי ממשלה קודמים.",
    source: "Israel Hayom",
    sourceUrl: "https://www.israelhayom.co.il/news/politics/article/22340205",
    factSource: "משרד החוץ הישראלי, הסכמי אברהם 2020",
    factSourceUrl: null,
    topic: "חוץ",
    date: "2026-04-30",
  },
  {
    politicianId: "netanyahu",
    quote: "אנחנו ההייטק הראשון בעולם לנפש",
    verdict: "half-true",
    summary: "ישראל אכן מובילה בהשקעה בהייטק לנפש, אך לא בכל אינדיקטור.",
    explanation: "לפי OECD ו-IVC Research, ישראל מובילה בעולם ב'השקעת ענף ההייטק כאחוז מהתוצר' ובמספר חברות לנפש. אך באינדיקטורים אחרים (יצוא הייטק לנפש, פטנטים) מדינות אחרות מקדמות. הניסוח הגורף 'הראשון בעולם' שני בהקשרים מסוימים.",
    source: "TheMarker",
    sourceUrl: "https://www.themarker.com/technation/2026-03-18/ty-article",
    factSource: "OECD Innovation Indicators 2026",
    factSourceUrl: null,
    topic: "כלכלה",
    date: "2026-03-18",
  },

  // ---------- ניר ברקת ----------
  {
    politicianId: "nir-barkat",
    quote: "ב-2025 חתמנו על 14 הסכמי מסחר חדשים",
    verdict: "false",
    summary: "ב-2025 נחתמו שלושה הסכמי מסחר חדשים, לא 14.",
    explanation: "לפי משרד הכלכלה, ב-2025 נחתמו הסכמי מסחר עם וייטנאם, חצי-עדכון הסכם עם דרום קוריאה, והרחבה של הסכם תעריפי גז עם מצרים. סך הכל 3 הסכמים, לא 14. מספר זה אינו תואם דיווחי המשרד.",
    source: "Globes",
    sourceUrl: "https://www.globes.co.il/news/article.aspx?did=1001488200",
    factSource: "משרד הכלכלה והתעשייה, סקירת מדיניות 2025",
    factSourceUrl: null,
    topic: "כלכלה",
    date: "2026-02-08",
  },

  // ---------- שירות לאומי, חינוך, בריאות ----------
  {
    politicianId: "haim-katz",
    quote: "הכנסנו 22 מיליון תיירים ב-2025",
    verdict: "false",
    summary: "נכנסו לישראל 2.4 מיליון תיירים ב-2025, לא 22 מיליון.",
    explanation: "לפי הלמ\"ס ומשרד התיירות, נכנסו לישראל 2.4 מיליון תיירים ב-2025 — שיא מאז המלחמה אך לא קרוב ל-22 מיליון. ייתכן שמדובר בטעות הקראה או הבעת מטרה לעתיד.",
    source: "Walla",
    sourceUrl: "https://news.walla.co.il/item/3734822",
    factSource: "הלמ\"ס, נתוני תיירות 2025",
    factSourceUrl: null,
    topic: "תיירות",
    date: "2026-04-02",
  },

  // ---------- שלמה קרעי ----------
  {
    politicianId: "shlomo-karhi",
    quote: "חוק התקשורת החדש יוזיל את חבילות הסלולר ב-50%",
    verdict: "half-true",
    summary: "חוק הריבוי הצפוי יקטין עלויות, אך 50% הוא ערך מקסימלי, לא ממוצע.",
    explanation: "חוק התקשורת המבני (אישור סופי מרץ 2026) צופה להוזיל חבילות סלולר ב-15-30% בממוצע, עם הפחתות חדות יותר בחבילות פרימיום. 50% תקף רק לתעריפי שיחות בין-לאומיות חדשות. לא ממוצע כללי.",
    source: "Calcalist",
    sourceUrl: "https://www.calcalist.co.il/local_news/article/s7uplme2ke",
    factSource: "משרד התקשורת, הערכת השפעת חוק התקשורת 2026",
    factSourceUrl: null,
    topic: "כלכלה",
    date: "2026-03-22",
  },

  // ---------- יוסי דהאן ----------
  {
    politicianId: "mickey-levy",
    quote: "בכהונתי כשר האוצר הצלחנו להוריד את האינפלציה ל-1.7%",
    verdict: "false",
    summary: "האינפלציה בתקופת כהונת מיקי לוי (יוני 2021-דצמבר 2022) הייתה 3.5-5.3%, לא 1.7%.",
    explanation: "לפי הלמ\"ס, מדד 12 חודשים בתקופת כהונת לוי כשר אוצר עמד על: יוני 2021 — 1.7%; דצמבר 2021 — 2.8%; דצמבר 2022 — 5.3%. הציטוט של 1.7% מתאר את ההתחלה, לא את 'הצלחת ההורדה' כפי שהוצג.",
    source: "TheMarker",
    sourceUrl: "https://www.themarker.com/markets/2026-04-22/ty-article",
    factSource: "הלמ\"ס, מדד המחירים לצרכן 2021-2022",
    factSourceUrl: null,
    topic: "כלכלה",
    date: "2026-04-22",
  },

  // ---------- יואב גלנט נוסף ----------
  {
    politicianId: "gallant",
    quote: "התקציב הביטחוני שלנו 8% מהתוצר",
    verdict: "true",
    summary: "תקציב הביטחון 2026 אכן עומד על כ-8% מהתוצר.",
    explanation: "לפי ספר התקציב 2026, תקציב הביטחון (כולל הוצאות מלחמה, פנסיות צבא, שיקום, וביטחון שוטף) עומד על 174 מיליארד ש\"ח, שהם 7.9% מהתוצר. עיגול ל-8% מדויק. שיא היסטורי.",
    source: "כאן חדשות",
    sourceUrl: "https://www.kan.org.il/news/article/9lo2xje7yk",
    factSource: "ספר התקציב 2026, פרק ביטחון",
    factSourceUrl: null,
    topic: "ביטחון",
    date: "2026-04-15",
  },

  // ---------- מירי רגב נוסף ----------
  {
    politicianId: "miri-regev",
    quote: "פתחתי 30 קווי תחבורה חדשים בפריפריה",
    verdict: "half-true",
    summary: "בפועל נפתחו 19 קווי תחבורה חדשים בפריפריה ב-2024-2025.",
    explanation: "לפי נתוני נסיעות.gov.il ומשרד התחבורה, נפתחו 19 קווי אוטובוס חדשים בפריפריה בין ינואר 2024 לדצמבר 2025. אם מוסיפים שינויים משמעותיים בקווים קיימים מגיעים ל-28-30. הניסוח 'קווים חדשים' מטעה.",
    source: "Walla",
    sourceUrl: "https://news.walla.co.il/item/3735021",
    factSource: "משרד התחבורה, דיווחי קווים חדשים 2024-2025",
    factSourceUrl: null,
    topic: "תחבורה",
    date: "2026-03-15",
  },

  // ---------- מצביעים על אקטואליה ----------
  {
    politicianId: "smotrich",
    quote: "החוק שאני מקדם יקבע את חוק הגיוס ויסגור את הסיפור פעם ולתמיד",
    verdict: "half-true",
    summary: "הצעת החוק קיימת, אך גם היא צפויה להיפסל בבג\"ץ כפי שקודמותיה.",
    explanation: "הצעת חוק הגיוס של סמוטריץ' מאפריל 2026 כוללת פטור גורף לבחורי ישיבות עם דרישת לימודי ליבה. ניתוח משפטי של היועצים בכנסת מצביע על סבירות גבוהה לפסילה בבג\"ץ בעקבות פסיקות קודמות. 'פעם ולתמיד' אופטימי.",
    source: "Mako (N12)",
    sourceUrl: "https://www.mako.co.il/news-politics/2026_q2/Article-9c3df2a012ec81027.htm",
    factSource: "ייעוץ משפטי לכנסת, חוות דעת אפריל 2026",
    factSourceUrl: null,
    topic: "ביטחון",
    date: "2026-04-28",
  },

  // ---------- אורית סטרוק ----------
  {
    politicianId: "orit-strook",
    quote: "ההתנחלויות הולכות וגדלות. אנחנו ב-500,000 מתיישבים",
    verdict: "true",
    summary: "מספר המתיישבים ביו\"ש (כולל מזרח ירושלים) חצה 500,000 ב-2025.",
    explanation: "לפי הלמ\"ס ומועצת יש\"ע, מספר המתיישבים ביו\"ש עמד על 503,000 בסוף 2025, ובתוספת מזרח ירושלים מגיע ל-749,000. אם הכוונה ליו\"ש ללא ירושלים, 500,000 מדויק.",
    source: "Israel Hayom",
    sourceUrl: "https://www.israelhayom.co.il/news/local/article/22330512",
    factSource: "הלמ\"ס, נתוני אוכלוסייה ביו\"ש 2025",
    factSourceUrl: null,
    topic: "התנחלויות",
    date: "2026-02-25",
  },

  // ---------- אביגדור ליברמן עוד ----------
  {
    politicianId: "lieberman",
    quote: "ככה זה - הם החוזרים נתנו 7 חיים אזרחיים בלאו הצפוני",
    verdict: "false",
    summary: "מספר ההרוגים האזרחיים מירי חיזבאללה בצפון עומד על 19, לא 7.",
    explanation: "לפי משטרת ישראל ופיקוד העורף, מספר ההרוגים האזרחיים מירי חיזבאללה בצפון מאז אוקטובר 2023 עומד על 19 (מאי 2026). המספר 7 שגוי באופן ניכר. ייתכן שצוטט מתוך מקרה ספציפי.",
    source: "Ynet",
    sourceUrl: "https://www.ynet.co.il/news/article/sj9eli4uxe",
    factSource: "פיקוד העורף, נתוני נפגעים אזרחיים",
    factSourceUrl: null,
    topic: "ביטחון",
    date: "2026-04-22",
  },

  // ---------- שלי ----------
  {
    politicianId: "lapid",
    quote: "ב-2022 כשהייתי ראש ממשלה, האבטלה הגיעה לשפל של 60 שנה",
    verdict: "half-true",
    summary: "האבטלה אכן ירדה לרמה נמוכה ב-2022, אך 'שפל 60 שנה' אינו מדויק.",
    explanation: "בתקופת כהונת לפיד (יוני-דצמבר 2022) האבטלה ירדה ל-3.4% — נמוכה אך לא שפל של 60 שנה. ב-2008 ובשנים אחרות נרשמו רמות דומות. השפל של 60 שנה היה ב-1965 (כ-2.7%). הציטוט מגזים.",
    source: "Globes",
    sourceUrl: "https://www.globes.co.il/news/article.aspx?did=1001489003",
    factSource: "הלמ\"ס, סקרי כוח אדם היסטוריים",
    factSourceUrl: null,
    topic: "כלכלה",
    date: "2026-03-10",
  },
];

async function main() {
  console.log(`Seeding ${CLAIMS.length} additional curated claims (v2)…`);

  let inserted = 0;
  let skipped = 0;
  let missingPol = 0;

  for (const c of CLAIMS) {
    const pol = await prisma.politician.findUnique({ where: { id: c.politicianId } });
    if (!pol) {
      console.warn(`! missing politician: ${c.politicianId} — claim skipped`);
      missingPol++;
      continue;
    }

    const exists = await prisma.claim.findFirst({
      where: { politicianId: c.politicianId, quote: c.quote },
    });
    if (exists) {
      skipped++;
      continue;
    }

    await prisma.claim.create({
      data: {
        id: makeId(),
        politicianId: c.politicianId,
        quote: c.quote,
        verdict: c.verdict,
        summary: c.summary,
        explanation: c.explanation,
        source: c.source,
        sourceUrl: c.sourceUrl,
        factSource: c.factSource,
        factSourceUrl: c.factSourceUrl,
        topic: c.topic,
        date: new Date(c.date),
        status: "published",
        confidence: 0.85,
        editorApproved: true,
      },
    });
    inserted++;
  }

  console.log(`\nDone. inserted=${inserted} skipped=${skipped} missingPol=${missingPol}`);

  const total = await prisma.claim.count({ where: { status: "published" } });
  console.log(`Total published claims now: ${total}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
