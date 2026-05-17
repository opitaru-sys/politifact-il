import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Robust env var loader. process.env wins if it's non-empty, otherwise we fall back
 * to reading .env.local / .env directly.
 *
 * Why: some parent processes (e.g. the Claude Code harness) inject empty-string values
 * for sensitive keys, which override Next.js's .env loading. This helper sidesteps that.
 */
export function getEnvVar(key: string): string | undefined {
  const fromProcess = process.env[key];
  if (fromProcess && fromProcess.length > 1) return fromProcess;

  // Walk up from CWD looking for .env files
  for (const file of [".env.local", ".env"]) {
    try {
      const path = resolve(process.cwd(), file);
      const content = readFileSync(path, "utf8");
      const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
      if (match) {
        let val = match[1].trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.length > 1) return val;
      }
    } catch {
      /* file missing - try next */
    }
  }
  return undefined;
}
