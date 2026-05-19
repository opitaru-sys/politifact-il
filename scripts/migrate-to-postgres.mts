#!/usr/bin/env tsx
/**
 * One-time SQLite → Postgres data migration.
 *
 * Run after you have:
 *   1. Set up a Neon Postgres project and got the connection URL
 *   2. Set DATABASE_URL_POSTGRES in your shell or .env.local to that URL
 *   3. Run `prisma db push` against the Postgres DB to create the empty schema
 *
 * Usage:
 *   DATABASE_URL_POSTGRES="postgres://..." npx tsx scripts/migrate-to-postgres.mts
 *
 * The script reads from the local SQLite dev.db via better-sqlite3 directly
 * (bypassing Prisma so we don't need both clients), and writes to Postgres
 * via the standard Prisma client (which is now Postgres-flavored).
 *
 * Idempotent: re-running with the same source data is a no-op because we
 * use UPSERTS keyed on the original IDs. Re-running after schema changes
 * may fail — push the new schema to Postgres first.
 */
import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

// Load env from .env.local in addition to the shell.
function forceLoadEnv(key: string): string | undefined {
  if (process.env[key] && process.env[key]!.length > 5) return process.env[key];
  for (const file of [".env.local", ".env"]) {
    try {
      const content = readFileSync(resolve(projectRoot, file), "utf8");
      const m = content.match(new RegExp(`^${key}=(.*)$`, "m"));
      if (m) {
        let val = m[1].trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.length > 5) {
          process.env[key] = val;
          return val;
        }
      }
    } catch { /* ignore */ }
  }
  return undefined;
}

const SQLITE_PATH = resolve(projectRoot, "prisma/dev.db");
const PG_URL = forceLoadEnv("DATABASE_URL_POSTGRES");
if (!PG_URL || !PG_URL.startsWith("postgres")) {
  console.error("Error: DATABASE_URL_POSTGRES must be set to a postgres:// URL");
  console.error("Set it in .env.local or as a shell variable, then re-run.");
  process.exit(1);
}

// Point Prisma at the Postgres URL by overriding DATABASE_URL for this run.
// We rely on schema.prisma being provider=postgresql at this point.
process.env.DATABASE_URL = PG_URL;

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

console.log(`Reading from:  ${SQLITE_PATH}`);
console.log(`Writing to:    ${PG_URL.replace(/:[^:@]+@/, ":***@")}`);

const sqlite = new Database(SQLITE_PATH, { readonly: true });

interface PoliticianRow {
  id: string;
  name: string;
  party: string;
  role: string | null;
  image: string | null;
  createdAt: number;
  updatedAt: number;
}

interface ClaimRow {
  id: string;
  politicianId: string;
  quote: string;
  verdict: string;
  summary: string | null;
  explanation: string;
  source: string;
  sourceUrl: string;
  factSource: string | null;
  factSourceUrl: string | null;
  topic: string;
  date: number;
  status: string;
  confidence: number | null;
  editorApproved: number; // SQLite stores Boolean as INTEGER
  verifiedAt: number | null;
  verifierNotes: string | null;
  createdAt: number;
  updatedAt: number;
}

interface CommentRow {
  id: string;
  claimId: string;
  author: string;
  body: string;
  createdAt: number;
}

interface ReportRow {
  id: string;
  claimId: string;
  reason: string;
  details: string | null;
  createdAt: number;
}

interface ArticleRow {
  id: string;
  title: string;
  url: string;
  source: string;
  content: string | null;
  publishedAt: number | null;
  fetchedAt: number;
  processed: number;
  extractedData: string | null;
}

// SQLite stores INTEGER timestamps as ms-since-epoch when Prisma writes DateTime.
// (Confirmed earlier: typeof(date) returns 'integer' in our DB.)
function toDate(v: number | null): Date | null {
  if (v === null || v === undefined) return null;
  return new Date(v);
}

async function migratePoliticians() {
  const rows = sqlite.prepare("SELECT * FROM Politician").all() as PoliticianRow[];
  console.log(`\nPoliticians: ${rows.length}`);
  let inserted = 0;
  for (const r of rows) {
    await prisma.politician.upsert({
      where: { id: r.id },
      create: {
        id: r.id,
        name: r.name,
        party: r.party,
        role: r.role,
        image: r.image,
        createdAt: toDate(r.createdAt) ?? new Date(),
        updatedAt: toDate(r.updatedAt) ?? new Date(),
      },
      update: { name: r.name, party: r.party, role: r.role, image: r.image },
    });
    inserted++;
    if (inserted % 20 === 0) process.stdout.write(`  ${inserted}/${rows.length}\r`);
  }
  console.log(`  ${inserted} migrated`);
}

async function migrateArticles() {
  const rows = sqlite.prepare("SELECT * FROM Article").all() as ArticleRow[];
  console.log(`\nArticles: ${rows.length}`);
  let inserted = 0;
  for (const r of rows) {
    await prisma.article.upsert({
      where: { id: r.id },
      create: {
        id: r.id,
        title: r.title,
        url: r.url,
        source: r.source,
        content: r.content,
        publishedAt: toDate(r.publishedAt),
        fetchedAt: toDate(r.fetchedAt) ?? new Date(),
        processed: r.processed === 1,
        extractedData: r.extractedData,
      },
      update: { processed: r.processed === 1 },
    });
    inserted++;
    if (inserted % 50 === 0) process.stdout.write(`  ${inserted}/${rows.length}\r`);
  }
  console.log(`  ${inserted} migrated`);
}

async function migrateClaims() {
  const rows = sqlite.prepare("SELECT * FROM Claim").all() as ClaimRow[];
  console.log(`\nClaims: ${rows.length}`);
  let inserted = 0;
  for (const r of rows) {
    await prisma.claim.upsert({
      where: { id: r.id },
      create: {
        id: r.id,
        politicianId: r.politicianId,
        quote: r.quote,
        verdict: r.verdict,
        summary: r.summary,
        explanation: r.explanation,
        source: r.source,
        sourceUrl: r.sourceUrl,
        factSource: r.factSource,
        factSourceUrl: r.factSourceUrl,
        topic: r.topic,
        date: toDate(r.date) ?? new Date(),
        status: r.status,
        confidence: r.confidence,
        editorApproved: r.editorApproved === 1,
        verifiedAt: toDate(r.verifiedAt),
        verifierNotes: r.verifierNotes,
        createdAt: toDate(r.createdAt) ?? new Date(),
        updatedAt: toDate(r.updatedAt) ?? new Date(),
      },
      update: {
        editorApproved: r.editorApproved === 1,
        verifiedAt: toDate(r.verifiedAt),
        verifierNotes: r.verifierNotes,
        summary: r.summary,
        explanation: r.explanation,
      },
    });
    inserted++;
    if (inserted % 20 === 0) process.stdout.write(`  ${inserted}/${rows.length}\r`);
  }
  console.log(`  ${inserted} migrated`);
}

async function migrateComments() {
  const rows = sqlite.prepare("SELECT * FROM Comment").all() as CommentRow[];
  console.log(`\nComments: ${rows.length}`);
  let inserted = 0;
  for (const r of rows) {
    await prisma.comment.upsert({
      where: { id: r.id },
      create: {
        id: r.id,
        claimId: r.claimId,
        author: r.author,
        body: r.body,
        createdAt: toDate(r.createdAt) ?? new Date(),
      },
      update: { body: r.body },
    });
    inserted++;
  }
  console.log(`  ${inserted} migrated`);
}

async function migrateReports() {
  const rows = sqlite.prepare("SELECT * FROM Report").all() as ReportRow[];
  console.log(`\nReports: ${rows.length}`);
  let inserted = 0;
  for (const r of rows) {
    await prisma.report.upsert({
      where: { id: r.id },
      create: {
        id: r.id,
        claimId: r.claimId,
        reason: r.reason,
        details: r.details,
        createdAt: toDate(r.createdAt) ?? new Date(),
      },
      update: {},
    });
    inserted++;
  }
  console.log(`  ${inserted} migrated`);
}

const startTime = Date.now();
// Order matters: parents before children to satisfy FK constraints.
await migratePoliticians();
await migrateArticles();
await migrateClaims();
await migrateComments();
await migrateReports();

// Sanity check
const counts = {
  politicians: await prisma.politician.count(),
  articles: await prisma.article.count(),
  claims: await prisma.claim.count(),
  comments: await prisma.comment.count(),
  reports: await prisma.report.count(),
};
console.log("\n--- Migration complete ---");
console.log(`Time: ${Math.round((Date.now() - startTime) / 1000)}s`);
console.log("Postgres counts:", counts);

sqlite.close();
await prisma.$disconnect();
process.exit(0);
