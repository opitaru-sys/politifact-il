/**
 * Knesset plenary transcript ingest.
 *
 * Pipeline:
 *   1. Fetch recent plenary sessions from the Knesset OData API
 *      (https://knesset.gov.il/Odata/ParliamentInfo.svc/)
 *   2. For each session, list its attached documents (.doc files)
 *   3. Download and parse each "תור מליאה" (single-speech turn) .doc
 *      using `word-extractor`
 *   4. Split the text by speaker tags (`<< דובר >>`, `<< יור >>`, etc.)
 *   5. For each non-trivial speaker block, create an Article row.
 *      Existing `processArticle` extracts claims and runs fact-check.
 *
 * Note: the Knesset uses legacy .doc (binary Word) format, not .docx.
 * `word-extractor` handles both.
 */
import WordExtractor from "word-extractor";
import { writeFileSync, unlinkSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { prisma } from "./db";

const ODATA_BASE = "https://knesset.gov.il/Odata/ParliamentInfo.svc";

interface PlenumSession {
  PlenumSessionID: number;
  Number: number;
  KnessetNum: number;
  Name: string;
  StartDate: string;
}

interface PlenumDocument {
  DocumentPlenumSessionID: string;
  PlenumSessionID: number;
  GroupTypeDesc: string;
  ApplicationDesc: string;
  FilePath: string;
}

interface SpeechBlock {
  speaker: string;          // raw speaker label from the doc
  speakerName: string;      // extracted plain name
  party?: string;           // extracted party name (in parens)
  text: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 BadukFactCheck" } });
  if (!res.ok) throw new Error(`OData fetch ${res.status}`);
  return (await res.json()) as T;
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 BadukFactCheck" } });
  if (!res.ok) throw new Error(`File fetch ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Latest N plenary sessions of the current Knesset (sorted newest first). */
export async function fetchRecentPlenumSessions(
  knessetNum: number = 25,
  top: number = 5,
): Promise<PlenumSession[]> {
  const url =
    `${ODATA_BASE}/KNS_PlenumSession?$filter=KnessetNum%20eq%20${knessetNum}` +
    `&$orderby=StartDate%20desc&$top=${top}&$format=json`;
  const data = await fetchJson<{ value: PlenumSession[] }>(url);
  return data.value;
}

export async function fetchSessionDocuments(plenumSessionID: number): Promise<PlenumDocument[]> {
  const url =
    `${ODATA_BASE}/KNS_DocumentPlenumSession?$filter=PlenumSessionID%20eq%20${plenumSessionID}` +
    `&$format=json`;
  const data = await fetchJson<{ value: PlenumDocument[] }>(url);
  return data.value;
}

/** Parse a .doc transcript into per-speaker blocks. */
export async function parseTranscript(docBuffer: Buffer): Promise<SpeechBlock[]> {
  const tmpDir = mkdtempSync(join(tmpdir(), "knesset-"));
  const tmpPath = join(tmpDir, "session.doc");
  writeFileSync(tmpPath, docBuffer);

  let body: string;
  try {
    const extractor = new WordExtractor();
    const doc = await extractor.extract(tmpPath);
    body = doc.getBody();
  } finally {
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
  }

  // Speakers are tagged like:  << דובר >> השר זאב אלקין: << דובר >>
  // Or:  << יור >> היו"ר אמיר אוחנה: << יור >>
  // Or:  << דובר_המשך >> שם דובר: << דובר_המשך >>
  // We split on the opening tag and pick up name+content.
  const blocks: SpeechBlock[] = [];
  const segments = body.split(/<<\s*(?:דובר|יור|קריאה|דובר_המשך)\s*>>/);

  for (let i = 1; i < segments.length; i += 2) {
    // odd-indexed segments are the speaker label, even-indexed are the speech.
    const speakerLabel = (segments[i] || "").trim();
    const speech = (segments[i + 1] || "").trim();
    if (!speakerLabel || speech.length < 200) continue; // skip empty / trivial interjections

    // Speaker label looks like:  "השר זאב אלקין:" or "הכנסת אלון שוסטר (כחול לבן - המחנה הממלכתי):"
    const cleanLabel = speakerLabel.replace(/:\s*$/, "").trim();
    const partyMatch = cleanLabel.match(/\(([^)]+)\)\s*$/);
    const party = partyMatch ? partyMatch[1].trim() : undefined;
    const namePart = cleanLabel.replace(/\([^)]*\)\s*$/, "").trim();
    // Strip honorifics: "השר", "השרה", "היו"ר", "ח"כ", "חבר הכנסת", "חברת הכנסת"
    const speakerName = namePart
      .replace(/^(השר|השרה|היו"ר|היו״ר|ח"כ|ח״כ|חבר הכנסת|חברת הכנסת|ראש הממשלה|רה"מ)\s+/u, "")
      .replace(/^(השר במשרד[^\s]*)\s+/u, "")
      .trim();

    blocks.push({ speaker: cleanLabel, speakerName, party, text: speech });
  }

  return blocks;
}

/** Save speech blocks as Articles so the existing AI pipeline can process them. */
export async function saveBlocksAsArticles(
  session: PlenumSession,
  doc: PlenumDocument,
  blocks: SpeechBlock[],
): Promise<number> {
  let created = 0;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    // Make a stable per-block URL so dedup works across re-runs.
    const url = `${doc.FilePath}#block-${i}`;
    const existing = await prisma.article.findUnique({ where: { url } });
    if (existing) continue;

    // Title includes speaker name so the existing extractor has context.
    const title = `${block.speakerName} (מליאת הכנסת)`;
    // Content: speaker label + speech text. Truncate to 5000 chars (matches RSS limit).
    const content = `דובר: ${block.speaker}\n\n${block.text}`.slice(0, 5000);

    await prisma.article.create({
      data: {
        title,
        url,
        source: "כנסת · מליאה",
        content,
        publishedAt: new Date(session.StartDate),
        processed: false,
      },
    });
    created++;
  }
  return created;
}

/** Top-level: ingest last N plenum sessions. Returns counts. */
export async function ingestKnessetPlenum(
  options: { knessetNum?: number; sessionLimit?: number } = {},
): Promise<{ sessions: number; docs: number; speeches: number }> {
  const { knessetNum = 25, sessionLimit = 5 } = options;

  const sessions = await fetchRecentPlenumSessions(knessetNum, sessionLimit);
  let totalDocs = 0;
  let totalSpeeches = 0;

  for (const session of sessions) {
    let docs: PlenumDocument[];
    try {
      docs = await fetchSessionDocuments(session.PlenumSessionID);
    } catch (err) {
      console.error(`Failed to fetch docs for session ${session.PlenumSessionID}:`, err);
      continue;
    }
    // Use "תור מליאה" speech turns. "דברי הכנסת" is the full session record.
    // Speech turns are smaller and easier to parse per-speaker.
    const speechDocs = docs.filter((d) => d.GroupTypeDesc.trim() === "תור מליאה");

    for (const doc of speechDocs) {
      totalDocs++;
      try {
        const buf = await fetchBuffer(doc.FilePath);
        const blocks = await parseTranscript(buf);
        const created = await saveBlocksAsArticles(session, doc, blocks);
        totalSpeeches += created;
        console.log(
          `  session ${session.Number} / doc ${doc.DocumentPlenumSessionID}: ${blocks.length} blocks, ${created} new`,
        );
      } catch (err) {
        console.error(`Failed to parse doc ${doc.DocumentPlenumSessionID}:`, err);
      }
    }
  }

  return { sessions: sessions.length, docs: totalDocs, speeches: totalSpeeches };
}
