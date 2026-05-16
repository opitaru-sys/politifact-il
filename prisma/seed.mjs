import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "dev.db");

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const db = new Database(dbPath);

const politicians = [
  { id: "netanyahu", name: "בנימין נתניהו", party: "הליכוד", role: "ראש הממשלה" },
  { id: "lapid", name: "יאיר לפיד", party: "יש עתיד", role: 'יו"ר האופוזיציה' },
  { id: "smotrich", name: "בצלאל סמוטריץ'", party: "הציונות הדתית", role: "שר האוצר" },
  { id: "ben-gvir", name: "איתמר בן גביר", party: "עוצמה יהודית", role: "שר הביטחון הלאומי" },
  { id: "gantz", name: "בני גנץ", party: "המחנה הממלכתי", role: null },
  { id: "lieberman", name: "אביגדור ליברמן", party: "ישראל ביתנו", role: null },
  { id: "deri", name: "אריה דרעי", party: 'ש"ס', role: 'יו"ר ש"ס' },
  { id: "gallant", name: "יואב גלנט", party: "הליכוד", role: null },
  { id: "saar", name: "גדעון סער", party: "הליכוד", role: "שר החוץ" },
  { id: "eisenkot", name: "גדי איזנקוט", party: "המחנה הממלכתי", role: null },
  { id: "goldknopf", name: "יצחק גולדקנופף", party: "יהדות התורה", role: "שר השיכון" },
  { id: "michaeli", name: "מרב מיכאלי", party: "העבודה", role: null },
  { id: "abbas", name: "מנסור עבאס", party: 'רע"מ', role: null },
  { id: "odeh", name: "איימן עודה", party: 'חד"ש-תע"ל', role: null },
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
