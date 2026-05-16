export interface FeedSource {
  name: string;
  url: string;
  category: "general" | "politics" | "economy";
}

export const RSS_FEEDS: FeedSource[] = [
  { name: "Ynet", url: "https://www.ynet.co.il/Integration/StoryRss2.xml", category: "general" },
  { name: "Ynet חדשות", url: "https://www.ynet.co.il/Integration/StoryRss1.xml", category: "general" },
  { name: "Walla", url: "https://rss.walla.co.il/feed/1", category: "general" },
  { name: "Walla פוליטי", url: "https://rss.walla.co.il/feed/141", category: "politics" },
  { name: "מעריב", url: "https://www.maariv.co.il/Rss/RssFeedsMivzakWorker", category: "general" },
  { name: "כלכליסט", url: "https://www.calcalist.co.il/GeneralRSS/0,16335,L-8,00.xml", category: "economy" },
  { name: "ישראל היום", url: "https://www.israelhayom.co.il/rss.xml", category: "general" },
];

export const POLITICIAN_NAMES = [
  "נתניהו", "לפיד", "סמוטריץ'", "בן גביר", "גנץ", "ליברמן", "דרעי",
  "גלנט", "סער", "איזנקוט", "גולדקנופף", "מיכאלי", "עבאס", "עודה",
  "בנימין נתניהו", "יאיר לפיד", "בצלאל סמוטריץ'", "איתמר בן גביר",
  "בני גנץ", "אביגדור ליברמן", "אריה דרעי", "יואב גלנט", "גדעון סער",
  "גדי איזנקוט", "יצחק גולדקנופף", "מרב מיכאלי", "מנסור עבאס", "איימן עודה",
];

export const NAME_TO_ID: Record<string, string> = {
  "נתניהו": "netanyahu",
  "בנימין נתניהו": "netanyahu",
  "לפיד": "lapid",
  "יאיר לפיד": "lapid",
  "סמוטריץ'": "smotrich",
  "בצלאל סמוטריץ'": "smotrich",
  "בן גביר": "ben-gvir",
  "איתמר בן גביר": "ben-gvir",
  "גנץ": "gantz",
  "בני גנץ": "gantz",
  "ליברמן": "lieberman",
  "אביגדור ליברמן": "lieberman",
  "דרעי": "deri",
  "אריה דרעי": "deri",
  "גלנט": "gallant",
  "יואב גלנט": "gallant",
  "סער": "saar",
  "גדעון סער": "saar",
  "איזנקוט": "eisenkot",
  "גדי איזנקוט": "eisenkot",
  "גולדקנופף": "goldknopf",
  "יצחק גולדקנופף": "goldknopf",
  "מיכאלי": "michaeli",
  "מרב מיכאלי": "michaeli",
  "עבאס": "abbas",
  "מנסור עבאס": "abbas",
  "עודה": "odeh",
  "איימן עודה": "odeh",
};
