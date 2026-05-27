#!/usr/bin/env tsx
/** Tehila Shwartz Altshuler flagged a Katz/Halutz claim where the verdict
 *  was true because Katz publicly declared "the defense ministry will have
 *  no contact with Dan Halutz" — but the substantive claim (ministry will
 *  actually do this) isn't verified, and may not even be legally possible.
 *
 *  Downgrade the verdict to half-true with the institutional-intent caveat
 *  + record the correction note explicitly crediting her feedback. */
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (url) process.env.DATABASE_URL = url;
const { PrismaClient } = await import("@prisma/client");
const { applyDowngrade } = await import("../src/lib/institutional-intent");
const p = new PrismaClient();

const APPLY = process.argv.includes("--apply");

const matches = await p.claim.findMany({
  where: {
    politicianId: "israel-katz",
    quote: { contains: "מערכת הביטחון לא תקיים עם דן חלוץ" },
  },
  select: {
    id: true,
    verdict: true,
    quote: true,
    explanation: true,
    verifierNotes: true,
    editorApproved: true,
  },
});

console.log(`Found ${matches.length} match(es) for Tehila's flagged claim`);
for (const c of matches) {
  console.log(`  ${c.id}  verdict=${c.verdict}  approved=${c.editorApproved}`);
  console.log(`    quote: ${c.quote.slice(0, 120)}`);

  if (c.verdict !== "true") {
    console.log(`    SKIP: already not "true" — leaving alone`);
    continue;
  }

  const notes = c.verifierNotes ? c.verifierNotes.split("; ") : [];
  const next = applyDowngrade({
    verdict: c.verdict,
    explanation: c.explanation,
    notes,
  });

  console.log(`    → verdict half-true, explanation prepended with caveat`);

  if (APPLY) {
    await p.claim.update({
      where: { id: c.id },
      data: {
        verdict: next.verdict,
        explanation: next.explanation,
        verifierNotes: next.notes.join("; "),
        editorApproved: true,
        correctionNote:
          'בעקבות משוב מד"ר תהילה שוורץ אלטשולר (המכון הישראלי לדמוקרטיה): פסק הדין שונה מ"אמת" ל"חצי-אמת" עם הסתייגות מפורשת — האמירה אכן נאמרה בפומבי, אך אין אימות לכך שמערכת הביטחון אכן תבצע את ההחרמה או שיש לה סמכות חוקית לעשות זאת. עיינו ב"הצהרת כוונה מוסדית" בתחילת ההסבר.',
        correctedAt: new Date(),
      },
    });
    console.log(`    ✓ updated`);
  }
}

if (!APPLY) console.log("\nDry run. --apply to commit.");
await p.$disconnect();
