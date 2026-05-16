import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "dev.db");

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const db = new Database(dbPath);

const politicians = [
  // ליכוד (32)
  { id: "netanyahu", name: "בנימין נתניהו", party: "הליכוד", role: "ראש הממשלה" },
  { id: "yariv-levin", name: "יריב לוין", party: "הליכוד", role: "שר המשפטים" },
  { id: "amir-ohana", name: "אמיר אוחנה", party: "הליכוד", role: "יושב ראש הכנסת" },
  { id: "nir-barkat", name: "ניר ברקת", party: "הליכוד", role: "שר הכלכלה" },
  { id: "avi-dichter", name: "אבי דיכטר", party: "הליכוד", role: "שר החקלאות" },
  { id: "israel-katz", name: "ישראל כ\"ץ", party: "הליכוד", role: "שר הביטחון" },
  { id: "shlomo-karhi", name: "שלמה קרעי", party: "הליכוד", role: "שר התקשורת" },
  { id: "miri-regev", name: "מירי רגב", party: "הליכוד", role: "שרת התחבורה" },
  { id: "miki-zohar", name: "מיקי זוהר", party: "הליכוד", role: "שר התרבות והספורט" },
  { id: "yoav-kisch", name: "יואב קיש", party: "הליכוד", role: "שר החינוך" },
  { id: "eli-cohen", name: "אלי כהן", party: "הליכוד", role: "שר האנרגיה" },
  { id: "dudi-amsalem", name: "דוד אמסלם", party: "הליכוד", role: null },
  { id: "amichai-chikli", name: "עמיחי שיקלי", party: "הליכוד", role: "שר התפוצות" },
  { id: "idit-silman", name: "עידית סילמן", party: "הליכוד", role: "שרת הגנת הסביבה" },
  { id: "haim-katz", name: "חיים כץ", party: "הליכוד", role: "שר התיירות" },
  { id: "david-bitan", name: "דוד ביטן", party: "הליכוד", role: null },
  { id: "yuli-edelstein", name: "יולי אדלשטיין", party: "הליכוד", role: null },
  { id: "galit-distel", name: "גלית דיסטל אטבריאן", party: "הליכוד", role: null },
  { id: "nissim-vaturi", name: "ניסים ואטורי", party: "הליכוד", role: null },
  { id: "tali-gottlieb", name: "טלי גוטליב", party: "הליכוד", role: null },
  { id: "hanoch-milwidsky", name: "חנוך מלביצקי", party: "הליכוד", role: null },
  { id: "boaz-bismuth", name: "בועז ביסמוט", party: "הליכוד", role: null },
  { id: "moshe-saada", name: "משה סעדה", party: "הליכוד", role: null },
  { id: "eli-dellal", name: "אלי דלל", party: "הליכוד", role: null },
  { id: "gila-gamliel", name: "גילה גמליאל", party: "הליכוד", role: null },
  { id: "ofir-katz", name: "אופיר כץ", party: "הליכוד", role: null },
  { id: "may-golan", name: "מאי גולן", party: "הליכוד", role: null },
  { id: "dan-illouz", name: "דן אילוז", party: "הליכוד", role: null },
  { id: "ariel-kallner", name: "אריאל קלנר", party: "הליכוד", role: null },
  { id: "amit-halevi", name: "עמית הלוי", party: "הליכוד", role: null },
  { id: "tsega-melaku", name: "צגה מלקו", party: "הליכוד", role: null },
  { id: "keti-shitrit", name: "קטי שטרית", party: "הליכוד", role: null },

  // יש עתיד (24)
  { id: "lapid", name: "יאיר לפיד", party: "יש עתיד", role: 'יו"ר האופוזיציה' },
  { id: "karine-elharrar", name: "קארין אלהרר", party: "יש עתיד", role: null },
  { id: "meir-cohen", name: "מאיר כהן", party: "יש עתיד", role: null },
  { id: "meirav-cohen", name: "מירב כהן", party: "יש עתיד", role: null },
  { id: "elazar-stern", name: "אלעזר שטרן", party: "יש עתיד", role: null },
  { id: "mickey-levy", name: "מיקי לוי", party: "יש עתיד", role: null },
  { id: "meirav-ben-ari", name: "מירב בן ארי", party: "יש עתיד", role: null },
  { id: "ram-ben-barak", name: "רם בן ברק", party: "יש עתיד", role: null },
  { id: "yoav-segalovitz", name: "יואב סגלוביץ'", party: "יש עתיד", role: null },
  { id: "boaz-toporovsky", name: "בועז טופורובסקי", party: "יש עתיד", role: null },
  { id: "yorai-lahav", name: "יוראי להב הרצנו", party: "יש עתיד", role: null },
  { id: "vladimir-beliak", name: "ולדימיר בליאק", party: "יש עתיד", role: null },
  { id: "ron-katz", name: "רון כץ", party: "יש עתיד", role: null },
  { id: "yasmin-fridman", name: "יסמין פרידמן", party: "יש עתיד", role: null },
  { id: "debbie-biton", name: "דבי ביטון", party: "יש עתיד", role: null },
  { id: "moshe-tur-paz", name: "משה טור פז", party: "יש עתיד", role: null },
  { id: "simon-davidson", name: "סימון דוידסון", party: "יש עתיד", role: null },
  { id: "naor-shiri", name: "נאור שירי", party: "יש עתיד", role: null },
  { id: "shelly-tal-meron", name: "שלי טל מירון", party: "יש עתיד", role: null },
  { id: "adi-azuz", name: "עדי עזוז", party: "יש עתיד", role: null },

  // הציונות הדתית (7)
  { id: "smotrich", name: "בצלאל סמוטריץ'", party: "הציונות הדתית", role: "שר האוצר" },
  { id: "ofir-sofer", name: "אופיר סופר", party: "הציונות הדתית", role: "שר העלייה והקליטה" },
  { id: "orit-strook", name: "אורית סטרוק", party: "הציונות הדתית", role: null },
  { id: "simcha-rothman", name: "שמחה רוטמן", party: "הציונות הדתית", role: null },
  { id: "michal-waldiger", name: "מיכל וולדיגר", party: "הציונות הדתית", role: null },
  { id: "ohad-tal", name: "אוהד טל", party: "הציונות הדתית", role: null },
  { id: "zvi-sukkot", name: "צבי סוכות", party: "הציונות הדתית", role: null },

  // ש"ס (11)
  { id: "deri", name: "אריה דרעי", party: 'ש"ס', role: 'יו"ר ש"ס' },
  { id: "yaakov-margi", name: "יעקב מרגי", party: 'ש"ס', role: null },
  { id: "yoav-ben-tzur", name: "יואב בן צור", party: 'ש"ס', role: null },
  { id: "michael-malchieli", name: "מיכאל מלכיאלי", party: 'ש"ס', role: "שר הדתות" },
  { id: "haim-biton", name: "חיים ביטון", party: 'ש"ס', role: null },
  { id: "moshe-arbel", name: "משה ארבל", party: 'ש"ס', role: "שר הפנים" },
  { id: "yinon-azulai", name: "ינון אזולאי", party: 'ש"ס', role: null },
  { id: "moshe-abutbul", name: "משה אבוטבול", party: 'ש"ס', role: null },
  { id: "uriel-buso", name: "אוריאל בוסו", party: 'ש"ס', role: null },
  { id: "yosef-taieb", name: "יוסף טייב", party: 'ש"ס', role: null },
  { id: "yonatan-mishraki", name: "יונתן מישריקי", party: 'ש"ס', role: null },

  // עוצמה יהודית (7)
  { id: "ben-gvir", name: "איתמר בן גביר", party: "עוצמה יהודית", role: "השר לביטחון לאומי" },
  { id: "yitzhak-wasserlauf", name: "יצחק וסרלאוף", party: "עוצמה יהודית", role: null },
  { id: "zvika-fogel", name: "צביקה פוגל", party: "עוצמה יהודית", role: null },
  { id: "limor-son-har-melech", name: "לימור סון הר מלך", party: "עוצמה יהודית", role: null },
  { id: "yitzhak-kroizer", name: "יצחק קרויזר", party: "עוצמה יהודית", role: null },
  { id: "amihai-eliyahu", name: "עמיחי אליהו", party: "עוצמה יהודית", role: "שר המורשת" },
  { id: "almog-cohen", name: "אלמוג כהן", party: "עוצמה יהודית", role: null },

  // יהדות התורה (7)
  { id: "goldknopf", name: "יצחק גולדקנופף", party: "יהדות התורה", role: "שר השיכון" },
  { id: "moshe-gafni", name: "משה גפני", party: "יהדות התורה", role: null },
  { id: "meir-porush", name: "מאיר פרוש", party: "יהדות התורה", role: null },
  { id: "uri-maklev", name: "אורי מקלב", party: "יהדות התורה", role: null },
  { id: "yaakov-tessler", name: "יעקב טסלר", party: "יהדות התורה", role: null },
  { id: "yaakov-asher", name: "יעקב אשר", party: "יהדות התורה", role: null },
  { id: "israel-eichler", name: "ישראל אייכלר", party: "יהדות התורה", role: null },

  // המחנה הממלכתי (8)
  { id: "gantz", name: "בני גנץ", party: "המחנה הממלכתי", role: null },
  { id: "eisenkot", name: "גדי איזנקוט", party: "המחנה הממלכתי", role: null },
  { id: "eitan-ginzburg", name: "איתן גינזבורג", party: "המחנה הממלכתי", role: null },
  { id: "pnina-tamano-shata", name: "פנינה תמנו שטה", party: "המחנה הממלכתי", role: null },
  { id: "hili-tropper", name: "חילי טרופר", party: "המחנה הממלכתי", role: null },
  { id: "michael-biton", name: "מיכאל ביטון", party: "המחנה הממלכתי", role: null },
  { id: "orit-farkash-hacohen", name: "אורית פרקש הכהן", party: "המחנה הממלכתי", role: null },
  { id: "alon-schuster", name: "אלון שוסטר", party: "המחנה הממלכתי", role: null },

  // ישראל ביתנו (6)
  { id: "lieberman", name: "אביגדור ליברמן", party: "ישראל ביתנו", role: null },
  { id: "oded-forer", name: "עודד פורר", party: "ישראל ביתנו", role: null },
  { id: "evgeny-sova", name: "יבגני סובה", party: "ישראל ביתנו", role: null },
  { id: "sharon-nir", name: "שרון ניר", party: "ישראל ביתנו", role: null },
  { id: "yulia-malinovsky", name: "יוליה מלינובסקי", party: "ישראל ביתנו", role: null },
  { id: "hamad-amar", name: "חמד עמאר", party: "ישראל ביתנו", role: null },

  // רע"מ (5)
  { id: "abbas", name: "מנסור עבאס", party: 'רע"מ', role: null },
  { id: "walid-taha", name: "וליד טאהא", party: 'רע"מ', role: null },
  { id: "iman-khatib-yasin", name: "אימאן ח'טיב יאסין", party: 'רע"מ', role: null },
  { id: "waleed-alhwashla", name: "וליד אלהואשלה", party: 'רע"מ', role: null },
  { id: "yasser-hujirat", name: "יאסר חג'יראת", party: 'רע"מ', role: null },

  // חד"ש-תע"ל (5)
  { id: "odeh", name: "איימן עודה", party: 'חד"ש-תע"ל', role: null },
  { id: "ahmad-tibi", name: "אחמד טיבי", party: 'חד"ש-תע"ל', role: null },
  { id: "aida-touma-suleiman", name: "עאידה תומא סלימאן", party: 'חד"ש-תע"ל', role: null },
  { id: "ofer-cassif", name: "עופר כסיף", party: 'חד"ש-תע"ל', role: null },

  // העבודה (4)
  { id: "michaeli", name: "מרב מיכאלי", party: "העבודה", role: null },
  { id: "naama-lazimi", name: "נעמה לזימי", party: "העבודה", role: null },
  { id: "gilad-kariv", name: "גלעד קריב", party: "העבודה", role: null },
  { id: "efrat-rayten", name: "אפרת רייטן", party: "העבודה", role: null },

  // הימין הממלכתי (4)
  { id: "saar", name: "גדעון סער", party: "תקווה חדשה", role: "שר החוץ" },
  { id: "zeev-elkin", name: "זאב אלקין", party: "תקווה חדשה", role: null },
  { id: "sharren-haskel", name: "שרן השכל", party: "תקווה חדשה", role: null },

  // נועם (1)
  { id: "avi-maoz", name: "אבי מעוז", party: "נועם", role: null },

  // former notable
  { id: "gallant", name: "יואב גלנט", party: "הליכוד", role: null },
];

const now = new Date().toISOString();

const stmt = db.prepare(`
  INSERT OR REPLACE INTO Politician (id, name, party, role, image, createdAt, updatedAt)
  VALUES (?, ?, ?, ?, NULL, ?, ?)
`);

for (const p of politicians) {
  stmt.run(p.id, p.name, p.party, p.role, now, now);
}

console.log(`Seeded ${politicians.length} politicians.`);

const count = db.prepare("SELECT COUNT(*) as c FROM Politician").get();
console.log(`Total politicians in DB: ${count.c}`);

db.close();
