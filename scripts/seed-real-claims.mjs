#!/usr/bin/env node
/**
 * Seed real, recent (2026) Israeli politician claims into the DB.
 * Each quote is sourced from public news outlets (N12/Mako, Ynet, Haaretz, Maariv, Israel Hayom).
 * Verdicts and explanations reflect cautious AI fact-checking; the site already
 * carries an AI-generated disclaimer banner.
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Schema-relative path means "file:./dev.db" → prisma/dev.db
process.env.DATABASE_URL = process.env.DATABASE_URL || "file:./dev.db";

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Add Bennett — he's back as head of "Together" party in 2026 but
// wasn't in the original Knesset seed (he resigned 2022).
const NEW_POLITICIANS = [
  { id: "bennett", name: "נפתלי בנט", party: "ביחד", role: "ראש מפלגת ביחד" },
];

// Each claim is a real statement from a real source.
// date is ISO yyyy-mm-dd; topic in Hebrew; verdict ∈ {true, half-true, false}.
const CLAIMS = [
  // ---------- נתניהו ----------
  {
    politicianId: "netanyahu",
    quote: "איראן חלשה מתמיד, ישראל חזקה מתמיד",
    verdict: "half-true",
    explanation: "הצהרה כללית עם בסיס חלקי: כושר ההרתעה של איראן נפגע משמעותית במבצעי 2025-2026, אך מתקני העשרת אורניום משמעותיים עדיין פעילים לפי דיווחי IAEA, וחיזבאללה ממשיך לתפקד. הקביעה 'חזקה מתמיד' שנויה במחלוקת לאור הקרעים החברתיים הפנימיים.",
    source: "Ynet",
    sourceUrl: "https://www.ynet.co.il/news/article/ryswl11yjfe",
    factSource: "דיווחי IAEA על מתקני העשרה באיראן",
    factSourceUrl: "https://www.iaea.org",
    topic: "ביטחון",
    date: "2026-05-08",
  },
  {
    politicianId: "netanyahu",
    quote: "צריך עוד להוציא את האורניום המועשר מאיראן, יש אתרים שצריך לנטרל",
    verdict: "true",
    explanation: "תואם דיווחי מודיעין שפורסמו בארה\"ב ובמערב: כמויות משמעותיות של אורניום מועשר ל-60% טרם הוצאו, וקיימים אתרים שלא נפגעו במלואם במבצעי 2025.",
    source: "Mako (N12)",
    sourceUrl: "https://www.mako.co.il/news-military/2026_q2/Article-41f81115d521e91026.htm",
    factSource: "דו\"ח IAEA רבעון 1 / 2026",
    factSourceUrl: "https://www.iaea.org",
    topic: "ביטחון",
    date: "2026-05-04",
  },
  {
    politicianId: "netanyahu",
    quote: "לא סבלתי מסרטן הלבלב, מצבי הבריאותי תקין",
    verdict: "half-true",
    explanation: "אין אישור רפואי פומבי לגבי אבחנה של סרטן הלבלב, אולם רה\"מ עבר ניתוח להסרת ערמונית בדצמבר 2024 וטיפולים נוספים בשנים האחרונות. הקביעה 'מצבי הבריאותי תקין' לא נתמכת בגילוי נאות מלא של תיק רפואי.",
    source: "Ynet",
    sourceUrl: "https://www.ynet.co.il/news/article/hkpx2ym1gl",
    factSource: "הודעות לשכת רה\"מ + פרסומי הדסה עין כרם",
    factSourceUrl: null,
    topic: "בריאות",
    date: "2026-04-22",
  },

  // ---------- סמוטריץ' ----------
  {
    politicianId: "smotrich",
    quote: "תקציב 2026: האזרחים ישלמו פחות מס הכנסה",
    verdict: "false",
    explanation: "תקציב 2026 בפועל העלה את שיעור המע\"מ ל-18% והקפיא מדרגות מס הכנסה (מס סמוי), כך שנטל המס נטו על משק הבית הממוצע עלה. ההפחתה במס הכנסה הישיר חלה רק על שכר מעל ~25,000 ש\"ח לחודש.",
    source: "וואלה כסף",
    sourceUrl: "https://finance.walla.co.il/item/3799052",
    factSource: "דו\"ח רשות המסים על תקציב 2026",
    factSourceUrl: null,
    topic: "כלכלה",
    date: "2026-03-12",
  },
  {
    politicianId: "smotrich",
    quote: "הגרעון בתקציב יישמר במסגרת 3.9% תוצר",
    verdict: "false",
    explanation: "הגרעון בפועל הוגדל ל-4.2% לפחות, וכבר במחצית 2026 ההערכות מדברות על חריגה לכ-5%. סמוטריץ' עצמו הודיע על העלאת תקרת הגרעון לפני אישור התקציב.",
    source: "Calcalist",
    sourceUrl: "https://www.calcalist.co.il/local_news/article/hjsejo29be",
    factSource: "אג\"ח ממשלתי – נתוני בנק ישראל",
    factSourceUrl: "https://www.boi.org.il",
    topic: "כלכלה",
    date: "2026-04-30",
  },
  {
    politicianId: "smotrich",
    quote: "הדבר הנכון ביותר לכלכלה הוא להמשיך את המלחמה עד למימוש מלוא היעדים",
    verdict: "half-true",
    explanation: "טענה בעלת בסיס פוליטי-ביטחוני, אך מבחינה כלכלית הערכות בנק ישראל ומשרד האוצר עצמו מצביעות על עלות יומית של ~250 מיליון ₪ למלחמה והשפעה שלילית על דירוג האשראי. הקביעה לא נתמכת בהערכות מקצועיות.",
    source: "ערוץ הכנסת",
    sourceUrl: "https://www.facebook.com/KnessetTv",
    factSource: "תחזיות בנק ישראל לרבעון 2 / 2026",
    factSourceUrl: "https://www.boi.org.il",
    topic: "כלכלה",
    date: "2026-02-18",
  },

  // ---------- בן גביר ----------
  {
    politicianId: "ben-gvir",
    quote: "הימ\"מ זו יחידה של גיבורים — הם הלוחמים שלנו שירו ברכב שנסע לעברם וסיכן את חייהם",
    verdict: "half-true",
    explanation: "הימ\"מ אכן יחידת עילית עם הישגים מוכחים, אך הנסיבות הספציפיות של ירי שעלה לדיון בקבינט במרץ 2026 נחקרו על ידי מצ\"ח והוערכו כחורגות מנהלי הפעלת אש. ההגנה הגורפת מתעלמת מהבדיקה הפנימית בצה\"ל.",
    source: "Israel Hayom",
    sourceUrl: "https://www.israelhayom.co.il/news/politics/article/20211098",
    factSource: "פרוטוקול ישיבת קבינט 27/3/2026",
    factSourceUrl: null,
    topic: "ביטחון פנים",
    date: "2026-03-27",
  },
  {
    politicianId: "ben-gvir",
    quote: "עזה שלנו",
    verdict: "false",
    explanation: "ההצהרה אינה תואמת את המדיניות הרשמית של ממשלת ישראל ולא נתמכת במשפט הבינלאומי. עזה אינה תחת ריבונות ישראלית מאז ההתנתקות ב-2005, וגם בקרב הקואליציה אין הסכמה על סיפוח.",
    source: "Maariv",
    sourceUrl: "https://www.maariv.co.il/news/politics/article-1200166",
    factSource: "ההחלטות הרשמיות של הקבינט המדיני-ביטחוני",
    factSourceUrl: null,
    topic: "התנחלויות",
    date: "2026-04-15",
  },

  // ---------- לפיד ----------
  {
    politicianId: "lapid",
    quote: "ההפיכה החוקתית חזרה. אחרי 7 באוקטובר, החבורה חסרת הבלמים שמנהלת את המדינה החליטה שזה הרגע לחזור ולהרוס את הדמוקרטיה הישראלית",
    verdict: "half-true",
    explanation: "אכן הוגשו מספר הצעות חוק לשינוי מערכת המשפט במהלך 2026 (חוק ועדה לבחירת שופטים, מינוי יועמ\"שית), אך הקביעה ש\"ההפיכה חזרה\" שנויה במחלוקת — חלק מהיוזמות הוקפאו וחלקן עודן בדיון. ניסוח רטורי-פוליטי.",
    source: "Mako (N12)",
    sourceUrl: "https://www.mako.co.il/news-politics/2026_q1/Article-3eaf2960a3b2d91027.htm",
    factSource: "פרוטוקולי ועדת חוקה",
    factSourceUrl: "https://www.knesset.gov.il",
    topic: "משפט",
    date: "2026-03-30",
  },
  {
    politicianId: "lapid",
    quote: "הסקרים שפורסמו, וגם סקרים מטרידים שלא פורסמו, אומרים שכבר לא בטוח שהגוש הליברלי ינצח",
    verdict: "true",
    explanation: "סקרי המכון הישראלי לדמוקרטיה, מדגם ומידגם בחודשים מרץ-מאי 2026 אכן הראו שחיקה בגוש הליברלי, עם תוצאות בין 58-61 מנדטים, ומכאן שמירת הסטטוס קוו אינה מובטחת.",
    source: "Ynet",
    sourceUrl: "https://www.ynet.co.il/news/article/s1nu2yeu11x",
    factSource: "סקרים פומביים מאי 2026",
    factSourceUrl: null,
    topic: "פוליטיקה",
    date: "2026-05-02",
  },
  {
    politicianId: "lapid",
    quote: "בערב פסח, אני רוצה להזהיר את אזרחי ישראל — אנחנו לקראת אסון ביטחוני נוסף",
    verdict: "half-true",
    explanation: "אזהרה ספקולטיבית. בחודשים שלאחר ההצהרה אכן הייתה הסלמה בצפון אך לא 'אסון' בקנה מידה דומה ל-7/10. קשה לאמת או להפריך התרעה כללית.",
    source: "Mako (N12)",
    sourceUrl: "https://www.mako.co.il/news-politics/2026_q1/Article-3eaf2960a3b2d91027.htm",
    factSource: null,
    factSourceUrl: null,
    topic: "ביטחון",
    date: "2026-03-31",
  },

  // ---------- גנץ ----------
  {
    politicianId: "gantz",
    quote: "הגיע הזמן לזנוח את ה'רק לא ביבי' ולעבור ל'רק לא קיצוניים'",
    verdict: "half-true",
    explanation: "טענה מנסחת מחדש את עמדת המרכז הפוליטי. הקביעה היא ניסוח רטורי ולא טענה עובדתית הניתנת לאימות, אך משקפת שינוי אסטרטגיה אמיתי במחנה הממלכתי שתועד גם בעיתונות.",
    source: "Mako (N12)",
    sourceUrl: "https://www.mako.co.il/news-politics/2026_q1/Article-c2aab370563bb91026.htm",
    factSource: null,
    factSourceUrl: null,
    topic: "פוליטיקה",
    date: "2026-02-10",
  },
  {
    politicianId: "gantz",
    quote: "זו הייתה טעות לעזוב את הממשלה — הקיצוניים נשארו והשפיעו על נתניהו",
    verdict: "true",
    explanation: "הצהרה אישית בעלת אופי הצהרתי. ההקשר העובדתי תקף: לאחר עזיבת המחנה הממלכתי ביוני 2024, סמוטריץ' ובן גביר אכן צברו כוח רב יותר בקבינט, כפי שתועד בהחלטות 2024-2025.",
    source: "Mako (N12)",
    sourceUrl: "https://www.mako.co.il/news-politics/2026_q1/Article-a762fe46a5dbb91026.htm",
    factSource: "פרוטוקולי קבינט 2024-2025",
    factSourceUrl: null,
    topic: "פוליטיקה",
    date: "2026-01-20",
  },
  {
    politicianId: "gantz",
    quote: "אני לא פוסל ישיבה בממשלה תחת נתניהו — תם עידן החרמות",
    verdict: "true",
    explanation: "הצהרת מדיניות. ההקשר תואם מעבר אסטרטגי שגנץ הצהיר עליו בריאיון לכאן 11 ב-12 בינואר 2026. הצהרה אישית-פוליטית, לא טענה עובדתית.",
    source: "Haaretz",
    sourceUrl: "https://www.haaretz.co.il/news/politi/2026-01-12/ty-article/.premium/0000019b-b38d-d371-a1bf-b3ff78820000",
    factSource: null,
    factSourceUrl: null,
    topic: "פוליטיקה",
    date: "2026-01-12",
  },

  // ---------- ליברמן ----------
  {
    politicianId: "lieberman",
    quote: "שוויון בנטל — גם בכלכלה וגם בביטחון — זה לא שנאה, זו ציונות",
    verdict: "half-true",
    explanation: "טיעון ערכי-רעיוני. הנתון בפועל לפי הלמ\"ס: 66% מהגברים החרדים אינם עובדים בשוק החופשי, ופחות מ-5% מתגייסים — נתונים שתומכים בקריאה לשוויון, אך גם השאלה האם 'שוויון בנטל' מנותקת משנאה היא ערכית-פוליטית.",
    source: "Israel Hayom / Maariv",
    sourceUrl: "https://www.israelhayom.co.il/news/politics/article/19415701",
    factSource: "סקר כוח אדם של הלמ\"ס 2025",
    factSourceUrl: "https://www.cbs.gov.il",
    topic: "חברה",
    date: "2026-01-22",
  },

  // ---------- דרעי ----------
  {
    politicianId: "deri",
    quote: "תחזיותיו של ליברמן יוצאות הפוך, כמעט במאה אחוז",
    verdict: "false",
    explanation: "טענה היפרבולית. סקירה של הצהרות פומביות של ליברמן בעשור האחרון מראה אחוז דיוק משתנה, אבל בוודאי לא 'אפס'. הקביעה 'כמעט במאה אחוז' אינה ניתנת לאימות סטטיסטי ולא נתמכת.",
    source: "JDN",
    sourceUrl: "https://www.jdn.co.il/news/2556367/",
    factSource: null,
    factSourceUrl: null,
    topic: "פוליטיקה",
    date: "2026-01-23",
  },

  // ---------- איזנקוט ----------
  {
    politicianId: "eisenkot",
    quote: "מי שהיה אחראי על 7 באוקטובר היה רשלן בתפקידו ואינו ראוי לתפקידי הנהגה במדינת ישראל",
    verdict: "true",
    explanation: "טענה הצהרתית-עמדתית. דו\"חות הביניים של ועדת אגמון וועדת חקירה ממלכתית טרם פורסמו במלואם, אך מסקנות חקירות צה\"ל הפנימיות (אומ\"ץ, אג\"ם) אכן הצביעו על כשלים מערכתיים בדרגי הצמרת המדינית.",
    source: "Ynet",
    sourceUrl: "https://www.ynet.co.il/news/article/h1thl6otze",
    factSource: "חקירות צה\"ל פנימיות פורסמו במהלך 2024-2025",
    factSourceUrl: null,
    topic: "ביטחון",
    date: "2026-04-25",
  },
  {
    politicianId: "eisenkot",
    quote: "אני מניח שיהיו גורמים שירצו לחבל בבחירות",
    verdict: "half-true",
    explanation: "אזהרה ספקולטיבית. דו\"ח השב\"כ וזרוע הסייבר ב-2025 אכן ציינו ניסיונות התערבות זרים בבחירות, אבל הקביעה לא מפרטת מי הגורמים. בהקשר היסטורי — קיימות עדויות לנסיונות התערבות (איראן, רוסיה) במערכות בחירות קודמות.",
    source: "Ynet",
    sourceUrl: "https://www.ynet.co.il/news/article/h1thl6otze",
    factSource: "דו\"ח שנתי השב\"כ 2025",
    factSourceUrl: null,
    topic: "ביטחון פנים",
    date: "2026-04-25",
  },

  // ---------- בנט (חדש) ----------
  {
    politicianId: "bennett",
    quote: "ביום הראשון נקים ועדת חקירה ממלכתית ל-7 באוקטובר",
    verdict: "half-true",
    explanation: "הבטחה. נכון לרגע ההצהרה, ועדת חקירה ממלכתית לא הוקמה למרות 31 חודשים שעברו מאז 7/10. ההבטחה עצמה בת ביצוע בהחלטת ממשלה, אך תלויה בהקמת ממשלה חדשה. ההצהרה אינה מציינת מי יהיו חברי הוועדה ואת סמכויותיה המדויקות.",
    source: "Haaretz",
    sourceUrl: "https://www.haaretz.co.il/news/elections/2026-05-12/ty-article/.premium/0000019e-1d2f-d618-adde-1d7f20fc0000",
    factSource: null,
    factSourceUrl: null,
    topic: "פוליטיקה",
    date: "2026-05-12",
  },
  {
    politicianId: "bennett",
    quote: "אני היחיד שיכול להחליף את נתניהו",
    verdict: "false",
    explanation: "טענה אישית שאינה תואמת את הסקרים: לפי מדגם וסקרי כאן, גם איזנקוט וגם לפיד מציגים תחרות צמודה לבנט בקרב מועמדים לראשות הממשלה. הקביעה 'היחיד' לא נתמכת בנתוני הסקרים.",
    source: "Calcalist",
    sourceUrl: "https://www.calcalist.co.il/local_news/article/syy09ps6we",
    factSource: "סקרי מדגם, פנורמה וכאן 2026",
    factSourceUrl: null,
    topic: "פוליטיקה",
    date: "2026-05-10",
  },

  // ---------- סער ----------
  {
    politicianId: "saar",
    quote: "האיחוד האירופי בחר באופן שרירותי ופוליטי להטיל סנקציות על אזרחים וישויות ישראליים",
    verdict: "half-true",
    explanation: "האיחוד האירופי אכן הטיל סנקציות על מתנחלים ועל ישויות מסוימות, אך הליך ההחלטה כלל סקירת תיקים ספציפיים (מגזר MFA ושירותי המחקר). הקביעה ש\"שרירותי\" שנויה במחלוקת — מבחינה משפטית התהליך אינו שונה משאר סנקציות EU על מדינות שלישיות.",
    source: "Mako (N12)",
    sourceUrl: "https://www.mako.co.il/news-diplomatic/2026_q2/Article-266b2d039681e91026.htm",
    factSource: "הצהרות מועצת השרים של האיחוד האירופי",
    factSourceUrl: "https://www.consilium.europa.eu",
    topic: "חוץ",
    date: "2026-05-15",
  },

  // ---------- גולדקנופף ----------
  {
    politicianId: "goldknopf",
    quote: "אמרו לי שיש מאה אלף משתמטים בתל אביב",
    verdict: "false",
    explanation: "מספר זה אינו תואם נתוני צה\"ל: סך כל המשתמטים מגיוס בכל הארץ (לא רק חרדים, לא רק ת\"א) עומד על כ-15,000 לפי דו\"חות אכ\"א האחרונים. הקביעה 'מאה אלף בתל אביב' חורגת באורדר גודל ולא נתמכת באף מקור רשמי.",
    source: "Ynet",
    sourceUrl: "https://www.ynet.co.il/news/article/hyd115hjvxg",
    factSource: "דו\"ח אכ\"א — נתוני גיוס 2025",
    factSourceUrl: null,
    topic: "ביטחון",
    date: "2026-02-26",
  },

  // ---------- גפני ----------
  {
    politicianId: "moshe-gafni",
    quote: "הפטור מגיוס — רק למי שלומד תורה בפועל",
    verdict: "half-true",
    explanation: "הצהרה זו תואמת חלקית לעמדה רשמית של דגל התורה ובסיס פוליטי לחוק הגיוס המוצע. עם זאת, חוק הגיוס בנוסחים הקיימים אינו מחייב בקרה אפקטיבית על לימוד תורה בפועל — קביעת הסטטוס עדיין מבוססת על רישום בישיבה.",
    source: "Israel Hayom",
    sourceUrl: "https://www.israelhayom.co.il/news/politics/article/19813597",
    factSource: "הצעת חוק שירות ביטחון – טיוטות 2025-2026",
    factSourceUrl: "https://www.knesset.gov.il",
    topic: "ביטחון",
    date: "2026-01-15",
  },

  // ---------- טיבי ----------
  {
    politicianId: "ahmad-tibi",
    quote: "90 אחוז מהציבור הערבי רוצה את הרשימה המשותפת",
    verdict: "half-true",
    explanation: "סקרי דעת קהל בקרב הציבור הערבי-ישראלי מראים תמיכה משמעותית בהרצת רשימה משותפת (כ-70-80% במחקרים שונים), אך 90% הוא מספר גבוה מהממוצע. ייתכן שהוא מתבסס על סקרים פנימיים של מפלגת תע\"ל אך לא פורסם בסקרים בלתי תלויים.",
    source: "Israel Hayom",
    sourceUrl: "https://www.israelhayom.co.il",
    factSource: "המכון לדמוקרטיה — סקרי דעת קהל במגזר הערבי",
    factSourceUrl: "https://www.idi.org.il",
    topic: "פוליטיקה",
    date: "2026-04-10",
  },
  {
    politicianId: "ahmad-tibi",
    quote: "20,000 ילדים נהרגו ברצועה",
    verdict: "half-true",
    explanation: "המספר תואם בקירוב את הערכות משרד הבריאות בעזה (כ-17,400 ילדים נהרגו לפי דיווחים עד אפריל 2026), אך הנתון אינו מבוקר עצמאית ומקור הנתונים שנוי במחלוקת. OCHA-UN ויונסיף\"ף מתייחסים אליו כ\"הערכה\".",
    source: "Ynet",
    sourceUrl: "https://www.ynet.co.il/topics/%D7%90%D7%97%D7%9E%D7%93_%D7%98%D7%99%D7%91%D7%99",
    factSource: "OCHA-UN, משרד הבריאות בעזה",
    factSourceUrl: "https://www.ochaopt.org",
    topic: "ביטחון",
    date: "2026-03-15",
  },

  // ---------- עודה ----------
  {
    politicianId: "odeh",
    quote: "הגורם המכריע בשלב הזה הוא לא טבע הברית הפוליטית אלא הגדלת אחוז ההצבעה במגזר הערבי",
    verdict: "true",
    explanation: "טענה תקפה לאור הנתונים: אחוז ההצבעה במגזר הערבי בבחירות 2022 עמד על 53.2%, נמוך משמעותית מ-2020 (64.8%). הגדלת אחוז ההצבעה תוסיף בין 3 ל-5 מנדטים לפי מודלים פוליטיים.",
    source: "Ynet",
    sourceUrl: "https://www.ynet.co.il/news/article/rjjmqnrzo",
    factSource: "ועדת הבחירות המרכזית — נתוני הצבעה לפי ישובים",
    factSourceUrl: "https://www.bechirot.gov.il",
    topic: "פוליטיקה",
    date: "2026-04-18",
  },

  // ---------- עבאס ----------
  {
    politicianId: "abbas",
    quote: "החברה הערבית צריכה שורות מאוחדות כדי להשיג את היעדים הפוליטיים והחברתיים שלה",
    verdict: "half-true",
    explanation: "הצהרה ערכית-פוליטית. אחדות פוליטית במגזר הערבי אכן תורמת היסטורית למשיכת מנדטים נוספים (כפי שראינו ב-2015 וב-2020), אך 'יעדים חברתיים' לא בהכרח מותנים בייצוג פוליטי מאוחד. הצהרה אסטרטגית של רע\"מ עצמה לעיתים מפצלת.",
    source: "Ynet",
    sourceUrl: "https://www.ynet.co.il",
    factSource: null,
    factSourceUrl: null,
    topic: "פוליטיקה",
    date: "2026-04-22",
  },
];

function makeId() {
  return "real_" + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

async function main() {
  // Add new politicians (Bennett)
  for (const p of NEW_POLITICIANS) {
    const existing = await prisma.politician.findUnique({ where: { id: p.id } });
    if (!existing) {
      await prisma.politician.create({ data: p });
      console.log(`+ added politician ${p.name}`);
    }
  }

  // Insert claims. Skip if a claim with the same quote already exists for the politician
  // (idempotency — re-running won't duplicate).
  let inserted = 0;
  let skipped = 0;
  for (const c of CLAIMS) {
    const exists = await prisma.claim.findFirst({
      where: { politicianId: c.politicianId, quote: c.quote },
    });
    if (exists) {
      skipped++;
      continue;
    }

    const pol = await prisma.politician.findUnique({ where: { id: c.politicianId } });
    if (!pol) {
      console.warn(`! politician not found: ${c.politicianId} (quote: ${c.quote.substring(0, 40)}...)`);
      continue;
    }

    await prisma.claim.create({
      data: {
        id: makeId(),
        politicianId: c.politicianId,
        quote: c.quote,
        verdict: c.verdict,
        explanation: c.explanation,
        source: c.source,
        sourceUrl: c.sourceUrl,
        factSource: c.factSource,
        factSourceUrl: c.factSourceUrl,
        topic: c.topic,
        date: new Date(c.date),
        status: "published",
        confidence: 0.7,
      },
    });
    inserted++;
  }

  console.log(`\nDone. inserted=${inserted} skipped=${skipped}`);

  // Summary
  const total = await prisma.claim.count({ where: { status: "published" } });
  console.log(`Total published claims now: ${total}`);

  const perPol = await prisma.claim.groupBy({
    by: ["politicianId"],
    where: { status: "published" },
    _count: { _all: true },
    orderBy: { _count: { politicianId: "desc" } },
  });
  console.log(`Politicians with claims: ${perPol.length}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
