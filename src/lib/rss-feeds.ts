export interface FeedSource {
  name: string;
  url: string;
  category: "general" | "politics" | "economy";
}

export const RSS_FEEDS: FeedSource[] = [
  // High-yield politics-specific feeds (politicians' own quotes are common)
  { name: "מעריב פוליטי", url: "https://www.maariv.co.il/Rss/RssFeedsPolitiMedini", category: "politics" },
  { name: "Walla פוליטיקה", url: "https://rss.walla.co.il/feed/3", category: "politics" },
  // (N12 politics-specific feed URL was a 404 and we don't have a known
  // working substitute; we ingest N12 via the general news feed below.)
  // Globes politics + economy — many ministerial quotes
  { name: "גלובס פוליטי", url: "https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=2", category: "politics" },
  // (Channel 7 / inn.co.il RSS URL returned 404. The site has a heavy
  // paywall layer in front of feeds — re-evaluate later if needed.)

  // General news feeds — lower yield but broader coverage
  { name: "Ynet", url: "https://www.ynet.co.il/Integration/StoryRss2.xml", category: "general" },
  { name: "Ynet חדשות", url: "https://www.ynet.co.il/Integration/StoryRss1.xml", category: "general" },
  { name: "Walla", url: "https://rss.walla.co.il/feed/1", category: "general" },
  { name: "מעריב", url: "https://www.maariv.co.il/Rss/RssFeedsMivzakWorker", category: "general" },
  { name: "ישראל היום", url: "https://www.israelhayom.co.il/rss.xml", category: "general" },
  // N12 main news — broader politics coverage
  { name: "N12 חדשות", url: "https://rcs.mako.co.il/rss/news-israel.xml", category: "general" },
  // ערוץ 13 חדשות
  { name: "13 חדשות", url: "https://13news.co.il/feed/", category: "general" },
  // Davar (left-leaning, labor/social) — adds opposition coverage
  { name: "דבר", url: "https://www.davar1.co.il/feed/", category: "general" },

  // Economy / business — ministerial quotes about budget, tax, etc.
  { name: "כלכליסט", url: "https://www.calcalist.co.il/Integration/StoryRss2.xml", category: "economy" },
  { name: "TheMarker", url: "https://www.themarker.com/cmlink/1.144", category: "economy" },

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
  "מאי גולן": "may-golan",
  "קלנר": "ariel-kallner", "אריאל קלנר": "ariel-kallner",
  "גלנט": "gallant", "יואב גלנט": "gallant",
  "שטרית": "keti-shitrit", "קטי שטרית": "keti-shitrit",
  // The bare "גולן" shortcut was REMOVED on 2026-05-26 to prevent
  // misattribution between May Golan (Likud) and Yair Golan
  // (הדמוקרטים, added below). Full names only for the Golans.

  // הדמוקרטים — 4 MKs total. Golan added 2026-05-26. Kariv, Lazimi,
  // and Rayten were originally in העבודה but moved to הדמוקרטים after
  // the 2024 merger. Michaeli refused the merger and stays in the
  // rump Labor faction — her NAME_TO_ID entry stays under העבודה.
  "יאיר גולן": "yair-golan",
  // Kariv, Lazimi, Rayten entries are already in the יש עתיד-adjacent
  // section below under their original political home; their party
  // affiliation is corrected in the DB (politician.party) but the
  // NAME_TO_ID id remains stable (gilad-kariv etc.).

  // ביחד (Bennett 2026 party). Bennett is no longer a sitting MK but
  // remains highly quoted; the politician row existed but had no
  // NAME_TO_ID entry, so all extracted quotes attributed to him were
  // silently dropped. Both forms below since reporters use both.
  "בנט": "bennett", "נפתלי בנט": "bennett",

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

  // === Variants surfaced by the 2026-05-26 extraction audit ===
  // The Knesset's official records use full legal names (with middle
  // names), and several MKs were in the DB but had no NAME_TO_ID
  // entry at all. ~1,700 historical claims were silently dropped at
  // the lookup step before this. Each line below maps a longer or
  // alternative form to an existing politician id.

  // Middle-name variants of politicians who already had a short form:
  "יצחק שמעון וסרלאוף": "yitzhak-wasserlauf",
  "מירי מרים רגב": "miri-regev",
  "אורית מלכה סטרוק": "orit-strook",
  "צבי ידידיה סוכות": "zvi-sukkot",
  "שרן מרים השכל": "sharren-haskel",
  "מיכל מרים וולדיגר": "michal-waldiger", "מיכל וולדיגר": "michal-waldiger",
  "קטי קטרין שטרית": "keti-shitrit",
  "בנימין גנץ": "gantz",
  "פנינה תמנו": "pnina-tamano-shata",

  // Politicians in the DB but completely missing from NAME_TO_ID:
  "מאיר כהן": "meir-cohen",
  "מירב בן ארי": "meirav-ben-ari",
  "יסמין פרידמן": "yasmin-fridman",
  "עדי עזוז": "adi-azuz",
  "ואליד אלהואשלה": "waleed-alhwashla", "וליד אלהואשלה": "waleed-alhwashla",
  "סימון דוידסון": "simon-davidson",
  "יצחק קרויזר": "yitzhak-kroizer",
  "נאור שירי": "naor-shiri",
  "שרון ניר": "sharon-nir",
  "רון כץ": "ron-katz",
  "יאסר חוג'יראת": "yasser-hujirat", "יאסר חג'יראת": "yasser-hujirat",

  // === New MKs added 2026-05-26 after web-research verification ===
  // יש עתיד: Mati Tzarfati Harkabi (#18 on list), Michal Shir Segman
  // (Likud → New Hope → Yesh Atid via Saar's merger).
  "מטי צרפתי הרכבי": "mati-tzarfati-harkabi", "מטי הרכבי": "mati-tzarfati-harkabi",
  "מיכל שיר סגמן": "michal-shir-segman", "מיכל שיר": "michal-shir-segman",
  // חד"ש-תע"ל: Samer Ben Saeed (sworn in June 2025 via rotation
  // agreement, replacing Yosef Atawneh on the Ta'al component).
  "סמיר בן סעיד": "samer-ben-saeed",

  // === Second-round audit fixes (2026-05-26 late) ===
  // Politicians who are ALREADY in the politician table but were
  // missing NAME_TO_ID entries → claims silently dropped.
  "ינון אזולאי": "yinon-azulai",
  "שלי טל מירון": "shelly-tal-meron",
  "אימאן ח'טיב יאסין": "iman-khatib-yasin", "אימאן חטיב יאסין": "iman-khatib-yasin",
  // Middle-name variants of existing MKs:
  "חנוך דב מלביצקי": "hanoch-milwidsky",
  "מכלוף מיקי זוהר": "miki-zohar",
  // Two real MKs surfaced by the second-round audit, verified via web
  // research (knesset.gov.il profiles confirmed). Both still in 25th
  // Knesset as of late 2025/2026.
  "שלום דנינו": "shalom-danino",
  "טטיאנה מזרסקי": "tatiana-mazarsky", "טניה מזרסקי": "tatiana-mazarsky",
};
