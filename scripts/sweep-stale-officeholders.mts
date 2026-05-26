#!/usr/bin/env tsx
/**
 * Sweep claims where the fact-check explanation contains a factually-wrong
 * present-tense assertion about who holds a current office. The pre-2025
 * Biden/Gallant/Halevi/etc. priors leak through grounding when the model's
 * cutoff bias is strong; this catches them retroactively.
 *
 * Patterns intentionally target PRESENT-TENSE usage of stale officeholders.
 * Historical mentions ("בכהונת ביידן ב-2023", "כשגלנט כיהן") are fine.
 * The patterns are tuned to fire on phrases that read as current.
 *
 * Dry-run by default. Pass --apply to commit.
 */
import { readFileSync, writeFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");

interface Pattern {
  regex: RegExp;
  label: string;
  /** Hebrew correction note (what we write to correctionNote). */
  note: string;
}

// Each pattern is matched against the EXPLANATION (not the quote — the
// quote is the politician's words; the bug we're hunting is in the AI's
// explanation of why it ruled the way it did).
//
// Two shapes of bug per transition:
//   (1) old officeholder asserted as CURRENT — "הנשיא ביידן"
//   (2) new officeholder asserted as NOT CURRENT — "אייל זמיר אינו הרמטכ"ל"
//
// Tuned to favor false negatives over false positives. Patterns require a
// present-tense linker; bare historical mentions ("גלנט פוטר ב-5.11.2024")
// won't fire.
const PATTERNS: Pattern[] = [
  // === Trump / Biden (US president transition 20.1.2025) ===
  {
    regex: /(?:הנשיא\s+ביידן|ביידן\s+הנשיא|ביידן.{0,30}(?:הוא|מכהן\s+כ?)נשיא|נשיא\s+ארה[״"]ב[,\s]+ביידן|ביידן[,\s]+נשיא\s+ארה[״"]ב)/,
    label: "Biden referenced as current US president",
    note: 'הוסר: ההסבר התייחס לג׳ו ביידן כנשיא ארה״ב המכהן, אך דונלד טראמפ מכהן כנשיא ה-47 מ-20.1.2025. הטענה תיבחן מחדש.',
  },
  {
    regex: /טראמפ\s+(?:אינו|לא)\s+(?:מכהן\s+כ?)?(?:ה?נשיא|הנשיא)/,
    label: "Trump asserted as NOT being US president",
    note: 'הוסר: ההסבר טען שדונלד טראמפ אינו נשיא ארה״ב, אך טראמפ מכהן כנשיא ה-47 מ-20.1.2025. הטענה תיבחן מחדש.',
  },
  {
    regex: /(?:אין|חסרה)\s+(?:לטראמפ|לדונלד\s+טראמפ)\s+סמכות/,
    label: "Trump asserted to lack presidential authority",
    note: 'הוסר: ההסבר טען שלטראמפ אין סמכות נשיאותית, אך טראמפ מכהן כנשיא ה-47 מ-20.1.2025. הטענה תיבחן מחדש.',
  },

  // === Katz / Gallant (Defense Minister, 5.11.2024) ===
  {
    regex: /(?:שר\s+הביטחון\s+גלנט|גלנט[,\s]+שר\s+הביטחון|גלנט\s+(?:הוא|מכהן\s+כ?)שר\s+הביטחון)/,
    label: "Gallant referenced as current Defense Minister",
    note: 'הוסר: ההסבר התייחס ליואב גלנט כשר הביטחון המכהן, אך ישראל כץ מכהן בתפקיד מנובמבר 2024. הטענה תיבחן מחדש.',
  },
  {
    regex: /ישראל\s+כץ\s+(?:אינו|לא)\s+(?:מכהן\s+כ?)?(?:ה)?שר\s+הביטחון/,
    label: "Katz asserted as NOT being current Defense Minister",
    note: 'הוסר: ההסבר טען שישראל כץ אינו שר הביטחון, אך כץ מכהן בתפקיד מ-5.11.2024 (החליף את יואב גלנט). הטענה תיבחן מחדש.',
  },

  // === Zamir / Halevi (IDF Chief of Staff, March 2025) ===
  {
    regex: /(?:הרמטכ[״"]ל\s+הלוי|הלוי[,\s]+הרמטכ[״"]ל|הלוי\s+(?:הוא|מכהן\s+כ?)רמטכ[״"]ל|הרצי\s+הלוי\s+(?:הוא|מכהן))/,
    label: "Halevi referenced as current IDF Chief of Staff (positive)",
    note: 'הוסר: ההסבר התייחס לרא״ל הרצי הלוי כרמטכ״ל המכהן, אך רא״ל אייל זמיר מכהן בתפקיד ממרץ 2025. הטענה תיבחן מחדש.',
  },
  {
    regex: /(?:הרמטכ[״"]ל\s+(?:ה)?מכהן.{0,80}(?:הוא\s+)?(?:רא[״"]ל\s+)?הרצי\s+הלוי|המכהן\s+בצה[״"]ל.{0,60}הרצי\s+הלוי)/,
    label: "Halevi described as currently serving (long-form)",
    note: 'הוסר: ההסבר התייחס לרא״ל הרצי הלוי כרמטכ״ל המכהן, אך רא״ל אייל זמיר מכהן בתפקיד ממרץ 2025. הטענה תיבחן מחדש.',
  },
  {
    regex: /(?:אייל\s+זמיר\s+(?:אינו|לא)\s+(?:הרמטכ[״"]ל|רמטכ[״"]ל|מכהן)|לא\s+קיים\s+רמטכ[״"]ל\s+בשם\s+זמיר)/,
    label: "Zamir asserted as NOT being current Chief of Staff",
    note: 'הוסר: ההסבר טען שאייל זמיר אינו הרמטכ״ל, אך רא״ל אייל זמיר מכהן כרמטכ״ל ה-24 ממרץ 2025 (החליף את רא״ל הרצי הלוי). הטענה תיבחן מחדש.',
  },

  // === Lapid / Bennett as PM (changeover end of 2022) ===
  {
    regex: /(?:ראש\s+הממשלה\s+(?:לפיד|בנט)|(?:לפיד|בנט)[,\s]+ראש\s+הממשלה|(?:לפיד|בנט)\s+(?:הוא|מכהן\s+כ?)ראש\s+הממשלה)/,
    label: "Lapid/Bennett referenced as current PM",
    note: 'הוסר: ההסבר התייחס ללפיד או בנט כראש ממשלה מכהן, אך בנימין נתניהו מכהן כראש הממשלה. הטענה תיבחן מחדש.',
  },
];

// Load all currently-visible claims.
const claims = await prisma.claim.findMany({
  where: { status: "published", editorApproved: true },
  select: {
    id: true,
    politicianId: true,
    quote: true,
    verdict: true,
    explanation: true,
    correctionNote: true,
  },
});

console.log(`Scanning ${claims.length} approved claims...\n`);

interface Hit {
  id: string;
  politicianId: string;
  label: string;
  note: string;
  quote: string;
  snippet: string;
}

const hits: Hit[] = [];
const counters: Record<string, number> = {};

for (const c of claims) {
  for (const p of PATTERNS) {
    const m = c.explanation.match(p.regex);
    if (m) {
      const idx = m.index ?? 0;
      const start = Math.max(0, idx - 40);
      const snippet = c.explanation.slice(start, idx + 120);
      hits.push({
        id: c.id,
        politicianId: c.politicianId,
        label: p.label,
        note: p.note,
        quote: c.quote,
        snippet,
      });
      counters[p.label] = (counters[p.label] ?? 0) + 1;
      break; // one pattern per claim, don't double-count
    }
  }
}

console.log(`Total matches: ${hits.length}\n`);
console.log("By pattern:");
for (const [label, n] of Object.entries(counters)) {
  console.log(`  ${n}x  ${label}`);
}
console.log();

// Write full audit log to a file so we can diff/review.
const auditPath = `sweep-stale-officeholders-${new Date().toISOString().slice(0, 10)}.log`;
const auditLines: string[] = [];
for (const h of hits) {
  auditLines.push(`---`);
  auditLines.push(`id: ${h.id}`);
  auditLines.push(`politician: ${h.politicianId}`);
  auditLines.push(`pattern: ${h.label}`);
  auditLines.push(`quote: ${h.quote}`);
  auditLines.push(`snippet: ...${h.snippet}...`);
  auditLines.push("");
}
writeFileSync(auditPath, auditLines.join("\n"), "utf8");
console.log(`Audit log written: ${auditPath}\n`);

if (!APPLY) {
  // Print first 10 inline for quick review
  console.log("Sample (first 10):");
  for (const h of hits.slice(0, 10)) {
    console.log(`  [${h.label}] ${h.politicianId}`);
    console.log(`    quote: ${h.quote.slice(0, 80)}`);
    console.log(`    snip:  ...${h.snippet.slice(0, 140)}...`);
    console.log();
  }
  console.log("Dry-run. Re-run with --apply to hide all matched claims.");
  await prisma.$disconnect();
  process.exit(0);
}

let updated = 0;
let skipped = 0;
for (const h of hits) {
  // Idempotency: skip if a correctionNote is already set (this claim
  // has been triaged before, possibly by another sweep).
  const current = await prisma.claim.findUnique({
    where: { id: h.id },
    select: { correctionNote: true },
  });
  if (current?.correctionNote) {
    skipped++;
    continue;
  }
  await prisma.claim.update({
    where: { id: h.id },
    data: {
      editorApproved: false,
      correctionNote: h.note,
      correctedAt: new Date(),
    },
  });
  updated++;
}

console.log(`\nApplied. updated=${updated} skipped=${skipped}`);
await prisma.$disconnect();
