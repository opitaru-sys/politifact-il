#!/usr/bin/env tsx
// One-off smoke test for the web_search-enabled factCheckClaim.
// Run: npx tsx scripts/smoke-web-search.mts
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

function forceLoadEnv(key: string): void {
  if (process.env[key] && process.env[key]!.length > 5) return;
  for (const file of [".env.local", ".env"]) {
    try {
      const content = readFileSync(resolve(projectRoot, file), "utf8");
      const m = content.match(new RegExp(`^${key}=(.*)$`, "m"));
      if (m) {
        let val = m[1].trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.length > 5) {
          process.env[key] = val;
          return;
        }
      }
    } catch { /* ignore */ }
  }
}
forceLoadEnv("ANTHROPIC_API_KEY");

const { factCheckClaim } = await import("../src/lib/fact-check");

const start = Date.now();
const result = await factCheckClaim({
  politicianName: "בנימין נתניהו",
  quote: "האבטלה בישראל נמצאת ברמה נמוכה היסטורית",
  topic: "כלכלה",
});
const elapsed = Math.round((Date.now() - start) / 1000);

console.log(`\n--- factCheckClaim returned in ${elapsed}s ---`);
console.log("VERDICT:", result.verdict);
console.log("CONFIDENCE:", result.confidence);
console.log("SUMMARY:", result.summary);
console.log("SOURCE:", result.factSource);
console.log("SOURCE_URL:", result.factSourceUrl);
console.log("EXPLANATION LEN:", result.explanation.length);
console.log("\nEXPLANATION:");
console.log(result.explanation);
