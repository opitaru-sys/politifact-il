import * as queries from "./queries";
import * as mock from "@/data/mock";

export const STATS_WINDOW_DAYS = 30;
export const MIN_CLAIMS_FOR_RANKING = 2;

export async function getRecentClaims(days: number = STATS_WINDOW_DAYS): Promise<(mock.Claim & { _politician?: { id: string; name: string; party: string; image?: string | null }; _commentCount?: number })[]> {
  const hasReal = await queries.hasAnyPublishedClaims();
  if (hasReal) {
    const claims = await queries.getRecentClaims(days);
    return claims.map((c) => ({
      id: c.id,
      politicianId: c.politicianId,
      quote: c.quote,
      verdict: c.verdict as mock.Verdict,
      explanation: c.explanation,
      source: c.source,
      sourceUrl: c.sourceUrl,
      factSource: c.factSource,
      factSourceUrl: c.factSourceUrl,
      date: c.date.toISOString().split("T")[0],
      topic: c.topic,
      _politician: {
        id: c.politician.id,
        name: c.politician.name,
        party: c.politician.party,
        image: c.politician.image,
      },
      _commentCount: c._count.comments,
    }));
  }
  return mock.getRecentClaims(days).map((c) => ({
    ...c,
    _politician: mock.getPolitician(c.politicianId)
      ? { ...mock.getPolitician(c.politicianId)!, image: mock.getPolitician(c.politicianId)!.image ?? null }
      : undefined,
    _commentCount: 0,
  }));
}

export async function getPoliticianStats(): Promise<queries.PoliticianStatsRow[]> {
  const hasReal = await queries.hasAnyPublishedClaims();
  if (hasReal) {
    const stats = await queries.getPoliticianStats();
    return stats.filter((s) => s.totalClaims >= MIN_CLAIMS_FOR_RANKING);
  }
  return mock.getPoliticianStats()
    .filter((s) => s.totalClaims >= MIN_CLAIMS_FOR_RANKING)
    .map((s) => ({
      ...s,
      politician: {
        ...s.politician,
        role: s.politician.role ?? null,
        image: s.politician.image ?? null,
      },
    }));
}

export async function getPartyStats() {
  const hasReal = await queries.hasAnyPublishedClaims();
  if (hasReal) {
    return queries.getPartyStats();
  }
  return mock.getPartyStats();
}

export async function getPoliticianById(id: string) {
  const hasReal = await queries.hasAnyPublishedClaims();
  if (hasReal) {
    const p = await queries.getPoliticianById(id);
    if (!p) return null;
    return {
      ...p,
      claims: p.claims.map((c) => ({
        id: c.id,
        politicianId: c.politicianId,
        quote: c.quote,
        verdict: c.verdict as mock.Verdict,
        explanation: c.explanation,
        source: c.source,
        sourceUrl: c.sourceUrl,
        factSource: c.factSource,
        factSourceUrl: c.factSourceUrl,
        date: c.date.toISOString().split("T")[0],
        topic: c.topic,
        _politician: {
          id: p.id,
          name: p.name,
          party: p.party,
          image: p.image,
        },
        _commentCount: c._count?.comments ?? 0,
      })),
    };
  }
  const politician = mock.getPolitician(id);
  if (!politician) return null;
  return {
    ...politician,
    createdAt: new Date(),
    updatedAt: new Date(),
    claims: mock.getClaimsForPolitician(id).map((c) => ({
      ...c,
      _politician: { id: politician.id, name: politician.name, party: politician.party, image: politician.image ?? null },
    })),
  };
}

export async function getAllPoliticianIds(): Promise<string[]> {
  const hasReal = await queries.hasAnyPublishedClaims();
  if (hasReal) {
    const all = await queries.getAllPoliticians();
    return all.filter((p) => p.claims.length > 0).map((p) => p.id);
  }
  return mock.politicians.map((p) => p.id);
}

/** Lightweight list for search/autocomplete — pulls from real DB if available. */
export async function getAllPoliticiansLite(): Promise<
  { id: string; name: string; party: string; image: string | null }[]
> {
  const hasReal = await queries.hasAnyPublishedClaims();
  if (hasReal) {
    const all = await queries.getAllPoliticians();
    return all.map((p) => ({
      id: p.id,
      name: p.name,
      party: p.party,
      image: p.image,
    }));
  }
  return mock.politicians.map((p) => ({
    id: p.id,
    name: p.name,
    party: p.party,
    image: p.image ?? null,
  }));
}
