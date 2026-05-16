import * as queries from "./queries";
import * as mock from "@/data/mock";

export async function getRecentClaims(days: number = 7): Promise<mock.Claim[]> {
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
    }));
  }
  return mock.getRecentClaims(days);
}

export async function getPoliticianStats(): Promise<queries.PoliticianStatsRow[]> {
  const hasReal = await queries.hasAnyPublishedClaims();
  if (hasReal) {
    return queries.getPoliticianStats();
  }
  return mock.getPoliticianStats().map((s) => ({
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
      })),
    };
  }
  const politician = mock.getPolitician(id);
  if (!politician) return null;
  return {
    ...politician,
    createdAt: new Date(),
    updatedAt: new Date(),
    claims: mock.getClaimsForPolitician(id),
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
