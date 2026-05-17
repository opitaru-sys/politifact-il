export interface FeedSource {
  name: string;
  url: string;
  category: "general" | "politics" | "economy";
}

export const RSS_FEEDS: FeedSource[] = [
  // High-yield politics-specific feeds (politicians' own quotes are common)
  { name: "מעריב פוליטי", url: "https://www.maariv.co.il/Rss/RssFeedsPolitiMedini", category: "politics" },
  { name: "Walla פוליטיקה", url: "https://rss.walla.co.il/feed/3", category: "politics" },

  // General news feeds — lower yield but broader coverage
  { name: "Ynet", url: "https://www.ynet.co.il/Integration/StoryRss2.xml", category: "general" },
  { name: "Ynet חדשות", url: "https://www.ynet.co.il/Integration/StoryRss1.xml", category: "general" },
  { name: "Walla", url: "https://rss.walla.co.il/feed/1", category: "general" },
  { name: "מעריב", url: "https://www.maariv.co.il/Rss/RssFeedsMivzakWorker", category: "general" },
  { name: "ישראל היום", url: "https://www.israelhayom.co.il/rss.xml", category: "general" },
  // הארץ feed has had XML parse errors — re-enable if it stabilises
  // { name: "הארץ", url: "https://www.haaretz.co.il/cmlink/1.1617539", category: "general" },
  // כאן throttles non-browser UAs heavily — skip for now
  // { name: "כאן חדשות", url: "https://www.kan.org.il/feed/", category: "general" },
];

export const NAME_TO_ID: Record<string, string> = {
  // ליכוד
  "נתניהו": "netanyahu", "בנימין נתניהו": "netanyahu", "ביבי": "netanyahu",
  "לוין": "yariv-levin", "יריב לוין": "yariv-levin",
  "אוחנה": "amir-ohana", "אמיר אוחנה": "amir-ohana",
  "ברקת": "nir-barkat", "ניר ברקת": "nir-barkat",
  "דיכטר": "avi-dichter", "אבי דיכטר": "avi-dichter",
  "ישראל כץ": "israel-katz",
  "קרעי": "shlomo-karhi", "שלמה קרעי": "shlomo-karhi",
  "רגב": "miri-regev", "מירי רגב": "miri-regev",
  "מיקי זוהר": "miki-zohar", "זוהר": "miki-zohar",
  "יואב קיש": "yoav-kisch", "קיש": "yoav-kisch",
  "אלי כהן": "eli-cohen",
  "אמסלם": "dudi-amsalem", "דוד אמסלם": "dudi-amsalem",
  "שיקלי": "amichai-chikli", "עמיחי שיקלי": "amichai-chikli",
  "סילמן": "idit-silman", "עידית סילמן": "idit-silman",
  "חיים כץ": "haim-katz",
  "ביטן": "david-bitan", "דוד ביטן": "david-bitan",
  "אדלשטיין": "yuli-edelstein", "יולי אדלשטיין": "yuli-edelstein",
  "דיסטל": "galit-distel", "גלית דיסטל": "galit-distel",
  "ואטורי": "nissim-vaturi", "ניסים ואטורי": "nissim-vaturi",
  "גוטליב": "tali-gottlieb", "טלי גוטליב": "tali-gottlieb",
  "ביסמוט": "boaz-bismuth", "בועז ביסמוט": "boaz-bismuth",
  "גמליאל": "gila-gamliel", "גילה גמליאל": "gila-gamliel",
  "אופיר כץ": "ofir-katz",
  "מאי גולן": "may-golan", "גולן": "may-golan",
  "קלנר": "ariel-kallner", "אריאל קלנר": "ariel-kallner",
  "גלנט": "gallant", "יואב גלנט": "gallant",

  // יש עתיד
  "לפיד": "lapid", "יאיר לפיד": "lapid",
  "אלהרר": "karine-elharrar", "קארין אלהרר": "karine-elharrar",
  "בן ברק": "ram-ben-barak", "רם בן ברק": "ram-ben-barak",
  "סגלוביץ'": "yoav-segalovitz", "יואב סגלוביץ'": "yoav-segalovitz",
  "טופורובסקי": "boaz-toporovsky", "בועז טופורובסקי": "boaz-toporovsky",
  "להב הרצנו": "yorai-lahav", "יוראי להב הרצנו": "yorai-lahav",
  "בליאק": "vladimir-beliak", "ולדימיר בליאק": "vladimir-beliak",
  "מיקי לוי": "mickey-levy",
  "אלעזר שטרן": "elazar-stern", "שטרן": "elazar-stern",

  // הציונות הדתית
  "סמוטריץ'": "smotrich", "בצלאל סמוטריץ'": "smotrich",
  "אופיר סופר": "ofir-sofer", "סופר": "ofir-sofer",
  "סטרוק": "orit-strook", "אורית סטרוק": "orit-strook",
  "רוטמן": "simcha-rothman", "שמחה רוטמן": "simcha-rothman",
  "סוכות": "zvi-sukkot", "צבי סוכות": "zvi-sukkot",

  // ש"ס
  "דרעי": "deri", "אריה דרעי": "deri",
  "מרגי": "yaakov-margi", "יעקב מרגי": "yaakov-margi",
  "מלכיאלי": "michael-malchieli", "מיכאל מלכיאלי": "michael-malchieli",
  "ארבל": "moshe-arbel", "משה ארבל": "moshe-arbel",
  "בוסו": "uriel-buso", "אוריאל בוסו": "uriel-buso",

  // עוצמה יהודית
  "בן גביר": "ben-gvir", "איתמר בן גביר": "ben-gvir",
  "וסרלאוף": "yitzhak-wasserlauf", "יצחק וסרלאוף": "yitzhak-wasserlauf",
  "פוגל": "zvika-fogel", "צביקה פוגל": "zvika-fogel",
  "סון הר מלך": "limor-son-har-melech", "לימור סון הר מלך": "limor-son-har-melech",
  "עמיחי אליהו": "amihai-eliyahu",
  "אלמוג כהן": "almog-cohen",

  // יהדות התורה
  "גולדקנופף": "goldknopf", "יצחק גולדקנופף": "goldknopf",
  "גפני": "moshe-gafni", "משה גפני": "moshe-gafni",
  "פרוש": "meir-porush", "מאיר פרוש": "meir-porush",
  "מקלב": "uri-maklev", "אורי מקלב": "uri-maklev",
  "אייכלר": "israel-eichler", "ישראל אייכלר": "israel-eichler",

  // המחנה הממלכתי
  "גנץ": "gantz", "בני גנץ": "gantz",
  "איזנקוט": "eisenkot", "גדי איזנקוט": "eisenkot",
  "גינזבורג": "eitan-ginzburg", "איתן גינזבורג": "eitan-ginzburg",
  "תמנו שטה": "pnina-tamano-shata", "פנינה תמנו שטה": "pnina-tamano-shata",
  "טרופר": "hili-tropper", "חילי טרופר": "hili-tropper",

  // ישראל ביתנו
  "ליברמן": "lieberman", "אביגדור ליברמן": "lieberman",
  "פורר": "oded-forer", "עודד פורר": "oded-forer",

  // רע"מ
  "עבאס": "abbas", "מנסור עבאס": "abbas",
  "וליד טאהא": "walid-taha",

  // חד"ש-תע"ל
  "עודה": "odeh", "איימן עודה": "odeh",
  "טיבי": "ahmad-tibi", "אחמד טיבי": "ahmad-tibi",
  "תומא סלימאן": "aida-touma-suleiman", "עאידה תומא סלימאן": "aida-touma-suleiman",
  "כסיף": "ofer-cassif", "עופר כסיף": "ofer-cassif",

  // העבודה
  "מיכאלי": "michaeli", "מרב מיכאלי": "michaeli",
  "לזימי": "naama-lazimi", "נעמה לזימי": "naama-lazimi",
  "קריב": "gilad-kariv", "גלעד קריב": "gilad-kariv",

  // תקווה חדשה
  "סער": "saar", "גדעון סער": "saar",
  "אלקין": "zeev-elkin", "זאב אלקין": "zeev-elkin",
  "השכל": "sharren-haskel", "שרן השכל": "sharren-haskel",

  // נועם
  "מעוז": "avi-maoz", "אבי מעוז": "avi-maoz",
};
