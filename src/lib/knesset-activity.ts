/**
 * Knesset activity ingest.
 *
 * Pulls per-MK plenum participation, bill sponsorships, and current
 * committee memberships. Writes one `KnessetActivity` row per matched
 * politician. Used by the `<KnessetActivityCard>` on /politician/[id]
 * and the leaderboard's minimum-participation threshold filter.
 *
 * **Why "plenum participation" and not "vote attendance":** the
 * Knesset's public `Votes.svc` OData is 5+ years stale (last vote in
 * `vote_rslts_kmmbr_shadow` is from 2021, max `knesset_num` is 24
 * while the current Knesset is 25). Voting attendance from that
 * source is unusable. Instead we use **our own ingested plenum
 * transcripts** (Article rows with `source="כנסת · מליאה"`) and
 * count distinct plenum sessions in the window where the MK
 * actually spoke. Arguably a stronger signal than passive presence
 * — an MK sitting silent in the room doesn't contribute much.
 *
 * Data sources still working:
 *  - `ParliamentInfo.svc/KNS_BillInitiator` + `KNS_Bill` — bill
 *    sponsorship by PersonID, filterable by `PublicationDate`. Fresh
 *    (last bill ~4 days old at time of writing).
 *  - `ParliamentInfo.svc/KNS_PersonToPosition` + `KNS_Position` —
 *    current role/committee positions. Snapshot, fresh.
 *  - `ParliamentInfo.svc/KNS_Person` — current MK identity with
 *    PersonID, used to bridge to our internal `Politician.id`
 *    via the `NAME_TO_ID` map.
 */
import { prisma } from "./db";
import { NAME_TO_ID } from "./rss-feeds";

const PARLIAMENT_BASE = "https://knesset.gov.il/Odata/ParliamentInfo.svc";

/**
 * Rolling window in days the activity stats are computed over. 90
 * days is long enough to smooth over Knesset recess weeks while
 * still being "recent enough to matter." Matches the longest
 * filter option on the public `?window=` selector.
 */
export const ACTIVITY_WINDOW_DAYS = 90;

interface OdataResponse<T> {
  "odata.metadata"?: string;
  value: T[];
}

interface KnsPerson {
  PersonID: number;
  FirstName: string;
  LastName: string;
  IsCurrent: boolean;
}

interface BillInitiator {
  BillInitiatorID: number;
  BillID: number;
  PersonID: number;
  IsInitiator: boolean;
}

interface Bill {
  BillID: number;
  Name: string;
  PublicationDate: string | null;
  LastUpdatedDate: string;
}

interface PersonToPosition {
  PersonToPositionID: number;
  PersonID: number;
  PositionID: number;
  StartDate: string | null;
  FinishDate: string | null;
}

interface Position {
  PositionID: number;
  Description: string;
}

/**
 * Page through an OData collection. Caller MUST NOT include `$top`
 * or `$skip` in the URL — we own pagination. Other params ($filter,
 * $orderby) are preserved.
 */
async function fetchAllPages<T>(url: string): Promise<T[]> {
  if (/[?&]\$(top|skip)=/.test(url)) {
    throw new Error(`fetchAllPages owns $top/$skip; caller passed: ${url}`);
  }
  const all: T[] = [];
  const PAGE_SIZE = 100;
  let skip = 0;
  for (;;) {
    const sep = url.includes("?") ? "&" : "?";
    const pageUrl = `${url}${sep}$top=${PAGE_SIZE}&$skip=${skip}&$format=json`;
    const res = await fetch(pageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 BadukFactCheck" },
    });
    if (!res.ok) throw new Error(`OData fetch ${res.status}: ${pageUrl}`);
    const json = (await res.json()) as OdataResponse<T>;
    const batch = json.value ?? [];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
    if (skip > 50_000) {
      throw new Error(`OData pagination runaway at skip=${skip} on ${url}`);
    }
  }
  return all;
}

/** Encode a JS Date as OData literal `YYYY-MM-DDT00:00:00`. */
function odataDate(d: Date): string {
  return d.toISOString().split(".")[0];
}

/** Strip quote marks and collapse whitespace for name matching. */
function normalizeName(s: string): string {
  return s.replace(/[״"']/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Build the Knesset PersonID ↔ our internal Politician map by
 * joining `KNS_Person` (current MKs) against `NAME_TO_ID`.
 * Politicians not in NAME_TO_ID are silently skipped — same trade-off
 * the rest of the pipeline makes.
 */
async function buildMkMapping(): Promise<
  Array<{ personId: number; politicianId: string; fullName: string }>
> {
  const persons = await fetchAllPages<KnsPerson>(
    `${PARLIAMENT_BASE}/KNS_Person?$filter=IsCurrent eq true`,
  );
  const matches: Array<{ personId: number; politicianId: string; fullName: string }> = [];
  const seenPoliticians = new Set<string>();
  for (const p of persons) {
    const fullName = normalizeName(`${p.FirstName} ${p.LastName}`);
    // Try multiple candidates — NAME_TO_ID is keyed on common Hebrew
    // forms ("ביבי", "סמוטריץ'") so direct full-name match is fragile.
    const candidates = [
      fullName,
      normalizeName(p.LastName),
      normalizeName(`${p.LastName} ${p.FirstName}`),
    ];
    let politicianId: string | null = null;
    for (const c of candidates) {
      if (NAME_TO_ID[c]) {
        politicianId = NAME_TO_ID[c];
        break;
      }
    }
    // Some KNS_Person rows have stale IsCurrent=true for replaced MKs.
    // If we already mapped a different KNS row to the same politician,
    // skip this one (keep first hit).
    if (politicianId && !seenPoliticians.has(politicianId)) {
      seenPoliticians.add(politicianId);
      matches.push({ personId: p.PersonID, politicianId, fullName });
    }
  }
  return matches;
}

/**
 * Plenum participation — count of distinct plenum sessions in window
 * where this MK spoke. Derived from `Article` rows. The transcript
 * ingest stores one Article per speaker turn with title format
 * `${SpeakerName} (מליאת הכנסת)` so we can group by source URL
 * (which encodes the session ID) and count distinct sessions per
 * speaker.
 */
async function countPlenumParticipation(
  politicianId: string,
  start: Date,
  end: Date,
): Promise<{ spoken: number; total: number }> {
  // Plenum article URLs from `src/lib/knesset-ingest.ts` look like
  // `${docFilePath}#block-${i}`. Strip the `#block-N` suffix to get
  // back the per-document URL, which uniquely identifies the source
  // doc. One plenum session can emit multiple docs across speakers,
  // but PUBLISHED-AT carries the session start date — group on that
  // instead, since it directly corresponds to "this calendar day's
  // plenum activity."
  const totalSessionsRaw = await prisma.$queryRaw<{ session: string }[]>`
    SELECT DISTINCT to_char("publishedAt", 'YYYY-MM-DD') AS session
    FROM "Article"
    WHERE source = 'כנסת · מליאה'
      AND "publishedAt" >= ${start}
      AND "publishedAt" <= ${end}
  `;
  const total = totalSessionsRaw.length;

  // Sessions this MK spoke at. We use `Article` rows (not Claim
  // rows) so an MK who spoke but had no fact-checkable claim
  // extracted still counts. The transcript ingest sets the title
  // to `${speakerName} (מליאת הכנסת)`, so we match the full
  // politician name.
  //
  // Using surname only would collide between MKs sharing a last
  // name (e.g. three Katzes in the current Knesset: Haim, Israel,
  // and Ofir Katz — all would get credit for each other's
  // sessions). Full-name match avoids the collision.
  const politician = await prisma.politician.findUnique({
    where: { id: politicianId },
    select: { name: true },
  });
  if (!politician) return { spoken: 0, total };
  const fullName = politician.name.trim();
  if (fullName.length < 3) return { spoken: 0, total };
  const spokenRows = await prisma.$queryRaw<{ session: string }[]>`
    SELECT DISTINCT to_char("publishedAt", 'YYYY-MM-DD') AS session
    FROM "Article"
    WHERE source = 'כנסת · מליאה'
      AND "publishedAt" >= ${start}
      AND "publishedAt" <= ${end}
      AND title LIKE ${"%" + fullName + "%"}
  `;
  return { spoken: spokenRows.length, total };
}

/**
 * Count bills initiated or co-initiated by an MK whose
 * `PublicationDate` falls in the window.
 */
async function countBillsInitiatedInWindow(
  personId: number,
  start: Date,
  end: Date,
): Promise<number> {
  const filter = `PersonID eq ${personId}`;
  const url = `${PARLIAMENT_BASE}/KNS_BillInitiator?$filter=${encodeURIComponent(filter)}`;
  const initiators = await fetchAllPages<BillInitiator>(url);
  if (initiators.length === 0) return 0;
  const billIds = [...new Set(initiators.map((i) => i.BillID))];
  let count = 0;
  const CHUNK = 30;
  for (let i = 0; i < billIds.length; i += CHUNK) {
    const chunk = billIds.slice(i, i + CHUNK);
    const idFilter = chunk.map((id) => `BillID eq ${id}`).join(" or ");
    const dateFilter = `PublicationDate ge datetime'${odataDate(start)}' and PublicationDate le datetime'${odataDate(end)}'`;
    const url2 = `${PARLIAMENT_BASE}/KNS_Bill?$filter=${encodeURIComponent(`(${idFilter}) and ${dateFilter}`)}`;
    const billsBatch = await fetchAllPages<Bill>(url2);
    count += billsBatch.length;
  }
  return count;
}

/**
 * Snapshot the MK's current role / committee positions.
 */
async function fetchCurrentCommittees(personId: number): Promise<
  Array<{ id: number; name: string }>
> {
  const filter = `PersonID eq ${personId}`;
  const url = `${PARLIAMENT_BASE}/KNS_PersonToPosition?$filter=${encodeURIComponent(filter)}`;
  const positions = await fetchAllPages<PersonToPosition>(url);
  const now = new Date();
  const active = positions.filter((p) => {
    if (p.FinishDate === null) return true;
    return new Date(p.FinishDate) > now;
  });
  if (active.length === 0) return [];
  const positionIds = [...new Set(active.map((a) => a.PositionID))];
  const out: Array<{ id: number; name: string }> = [];
  const CHUNK = 30;
  for (let i = 0; i < positionIds.length; i += CHUNK) {
    const chunk = positionIds.slice(i, i + CHUNK);
    const idFilter = chunk.map((id) => `PositionID eq ${id}`).join(" or ");
    const url2 = `${PARLIAMENT_BASE}/KNS_Position?$filter=${encodeURIComponent(idFilter)}`;
    const positionsMeta = await fetchAllPages<Position>(url2);
    for (const pm of positionsMeta) {
      out.push({ id: pm.PositionID, name: pm.Description });
    }
  }
  return out;
}

export interface IngestSummary {
  matched: number;
  updated: number;
  windowStart: Date;
  windowEnd: Date;
}

/**
 * Top-level entry point — fetches everything for every current MK we
 * recognise, and upserts the result. Idempotent: re-running same day
 * overwrites the existing row with refreshed numbers.
 */
export async function ingestKnessetActivity(): Promise<IngestSummary> {
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd);
  windowStart.setDate(windowStart.getDate() - ACTIVITY_WINDOW_DAYS);

  const mapping = await buildMkMapping();
  console.log(`Knesset activity: ${mapping.length} MKs matched.`);

  let updated = 0;
  for (const m of mapping) {
    try {
      const [plenum, billsSponsored, committees] = await Promise.all([
        countPlenumParticipation(m.politicianId, windowStart, windowEnd),
        countBillsInitiatedInWindow(m.personId, windowStart, windowEnd),
        fetchCurrentCommittees(m.personId),
      ]);
      const pct =
        plenum.total > 0
          ? Math.round((plenum.spoken / plenum.total) * 1000) / 10
          : 0;
      await prisma.knessetActivity.upsert({
        where: { politicianId: m.politicianId },
        create: {
          politicianId: m.politicianId,
          knsPersonId: m.personId,
          windowStart,
          windowEnd,
          plenumSessionsTotal: plenum.total,
          plenumSessionsSpoken: plenum.spoken,
          plenumParticipationPct: pct,
          billsSponsored,
          committeesMember: committees,
        },
        update: {
          knsPersonId: m.personId,
          windowStart,
          windowEnd,
          plenumSessionsTotal: plenum.total,
          plenumSessionsSpoken: plenum.spoken,
          plenumParticipationPct: pct,
          billsSponsored,
          committeesMember: committees,
          fetchedAt: new Date(),
        },
      });
      updated++;
      console.log(
        `  [${m.fullName}] plenum=${plenum.spoken}/${plenum.total} (${pct}%), bills=${billsSponsored}, roles=${committees.length}`,
      );
    } catch (err) {
      console.error(`  [${m.fullName}] FAILED:`, err instanceof Error ? err.message : err);
    }
  }

  return { matched: mapping.length, updated, windowStart, windowEnd };
}
