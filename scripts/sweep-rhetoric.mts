#!/usr/bin/env tsx
/**
 * Quick admin sweep: set editorApproved=false on any claim whose quote
 * is obviously rhetoric / opinion / slogan that the new prompts would
 * reject but the old prompts let through.
 *
 * Patterns are intentionally narrow — only matches truly content-free
 * phrases, not legitimate factual claims that happen to be brief.
 */
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

// Phrases that are 100% rhetoric / opinion / slogan with no factual content.
// Each entry is matched as a substring against the normalized quote.
const RHETORIC_PATTERNS: { regex: RegExp; reason: string }[] = [
  { regex: /^רעיון לא רע/, reason: "opinion-only ('not a bad idea')" },
  { regex: /נגמרה הקייטנה/, reason: "slogan ('the picnic is over')" },
  { regex: /עם ישראל חי/, reason: "slogan ('the people of Israel live')" },
  { regex: /הם תומכי טרור/, reason: "general accusation, no specific act" },
  { regex: /אנחנו ננצח/, reason: "slogan ('we will win')" },
  { regex: /אם אמשיך בתפקידי/, reason: "conditional/future statement" },
  { regex: /^"רעיון לא רע"$/, reason: "opinion-only (quoted, no content)" },
];

const claims = await prisma.claim.findMany({
  where: { status: "published", editorApproved: true },
  select: { id: true, quote: true },
});

let rejected = 0;
for (const c of claims) {
  const normalized = c.quote.replace(/[״"׳']/g, "").trim();
  for (const { regex, reason } of RHETORIC_PATTERNS) {
    if (regex.test(normalized) || regex.test(c.quote)) {
      await prisma.claim.update({
        where: { id: c.id },
        data: {
          editorApproved: false,
          verifierNotes: `Auto-rejected: ${reason}`,
        },
      });
      console.log(`✗ "${c.quote.slice(0, 70)}" — ${reason}`);
      rejected++;
      break;
    }
  }
}

console.log(`\n${rejected} claims rejected.`);
await prisma.$disconnect();
