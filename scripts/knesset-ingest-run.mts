#!/usr/bin/env tsx
/**
 * Standalone runner for the Knesset plenary ingest. Use:
 *   npx tsx scripts/knesset-ingest-run.mts
 *
 * Pulls the latest N plenary sessions, downloads & parses .doc transcripts,
 * and creates Article rows for the existing AI extraction pipeline.
 */
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
forceLoadEnv("DATABASE_URL");

const sessionLimit = parseInt(process.argv[2] ?? "2", 10);
console.log(`Ingesting Knesset plenum (sessions=${sessionLimit})…`);

const { ingestKnessetPlenum } = await import("../src/lib/knesset-ingest");
const result = await ingestKnessetPlenum({ knessetNum: 25, sessionLimit });
console.log(`Done: ${result.sessions} sessions / ${result.docs} docs / ${result.speeches} new speeches`);
process.exit(0);
