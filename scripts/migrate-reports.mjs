import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const db = new Database(path.join(__dirname, "..", "prisma", "dev.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS "Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "claimId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Report_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )
`);

db.exec(`CREATE INDEX IF NOT EXISTS "Report_claimId_idx" ON "Report"("claimId")`);

console.log("Report table created successfully");
db.close();
