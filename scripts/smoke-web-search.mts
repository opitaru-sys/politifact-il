#!/usr/bin/env tsx
// One-off smoke test for the Gemini-powered factCheckClaim.
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
forceLoadEnv("GEMINI_API_KEY");

if (!process.env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY not loaded. Add it to .env.local first.");
  process.exit(1);
}

const { factCheckClaim, extractClaims } = await import("../src/lib/fact-check");
const { verifyClaim } = await import("../src/lib/verify-claim");

console.log("=== Smoke test 1: factCheckClaim with Google Search grounding ===\n");

const t1 = Date.now();
const result = await factCheckClaim({
  politicianName: "בנימין נתניהו",
  quote: "האבטלה בישראל נמצאת ברמה נמוכה היסטורית",
  topic: "כלכלה",
});
console.log(`Returned in ${Math.round((Date.now() - t1) / 1000)}s`);
console.log("VERDICT:", result.verdict);
console.log("CONFIDENCE:", result.confidence);
console.log("SUMMARY:", result.summary);
console.log("SOURCE:", result.factSource);
console.log("SOURCE_URL:", result.factSourceUrl);
console.log("EXPLANATION:", result.explanation.slice(0, 300));

console.log("\n=== Smoke test 2: verifyClaim ===\n");
const t2 = Date.now();
const verification = await verifyClaim({
  quote: "האבטלה בישראל נמצאת ברמה נמוכה היסטורית",
  verdict: result.verdict,
  summary: result.summary,
  explanation: result.explanation,
  source: "test",
  factSource: result.factSource,
  politicianName: "בנימין נתניהו",
  topic: "כלכלה",
});
console.log(`Returned in ${Math.round((Date.now() - t2) / 1000)}s`);
console.log("APPROVED:", verification.approved);
console.log("CONFIDENCE:", verification.confidence);
console.log("ISSUES:", verification.issues);

console.log("\n=== Smoke test 3: extractClaims (should filter rhetoric) ===\n");
const t3 = Date.now();
const extracted = await extractClaims(
  "ראיון עם נתניהו",
  `ראש הממשלה בנימין נתניהו אמר היום בראיון: "האבטלה ירדה ל-3.2% והגירעון נמצא ב-3.9%. הם תומכי טרור ועם ישראל חי."`,
  "test"
);
console.log(`Returned in ${Math.round((Date.now() - t3) / 1000)}s`);
console.log(`Extracted ${extracted.length} claims:`);
for (const c of extracted) {
  console.log(`  - ${c.politicianName} (${c.topic}): ${c.quote.slice(0, 80)}`);
}
console.log("\n(Expect 1-2 quotes about unemployment/deficit, NOT the 'terrorism supporters' or 'עם ישראל חי' rhetoric.)");
