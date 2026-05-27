/**
 * Politician-name markup convention shared by the digest, topic-page
 * insights, and profile TopicBreakdown insight.
 *
 * Format: {{P:politician-id|תיוג להצגה}}
 *   {{P:netanyahu|בנימין נתניהו}} → renders as a hyperlink
 *
 * Both deterministic templates (topic page, TopicBreakdown) and the
 * AI synthesis prompt (digest) emit this form. The renderer parses
 * it and produces <Link> components on the client.
 *
 * Why this convention:
 *  - Robust to AI prose: the AI just needs to wrap names in a marker,
 *    no fragile regex name-matching after the fact.
 *  - Lets the link target stay stable even if the display name varies
 *    (the marker carries the politician id, not a name lookup).
 *  - Easy to author by hand — same markdown-like feel.
 */

export const POLITICIAN_MARKER_REGEX = /\{\{P:([^|}]+)\|([^}]+)\}\}/g;

/**
 * Wrap a politician's display name in the marker. Use in deterministic
 * templates where you have both the id and the name in hand:
 *   `${markPolitician(id, name)} מקבל ${score}% בנושא...`
 */
export function markPolitician(id: string, name: string): string {
  return `{{P:${id}|${name}}}`;
}

/**
 * Strip markup back to plain text — useful for share-text and other
 * places where we want the politician name but not the hyperlink.
 */
export function unmarkPoliticians(text: string): string {
  return text.replace(POLITICIAN_MARKER_REGEX, "$2");
}

/**
 * Token form used by React renderers: split a marked-up string into
 * an array of `{ type: "text" | "politician", ... }` chunks. Pure JS
 * so it can run on the server.
 */
export type InsightToken =
  | { type: "text"; value: string }
  | { type: "politician"; id: string; name: string };

export function tokenizeInsight(body: string): InsightToken[] {
  const tokens: InsightToken[] = [];
  // Reset the regex's lastIndex by creating a fresh instance — `g`
  // flag carries state between calls otherwise.
  const re = new RegExp(POLITICIAN_MARKER_REGEX.source, "g");
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > lastIdx) {
      tokens.push({ type: "text", value: body.slice(lastIdx, m.index) });
    }
    tokens.push({ type: "politician", id: m[1], name: m[2] });
    lastIdx = re.lastIndex;
  }
  if (lastIdx < body.length) {
    tokens.push({ type: "text", value: body.slice(lastIdx) });
  }
  return tokens;
}

/**
 * Defensive post-processor: repairs malformed politician markers that
 * the AI sometimes produces despite the prompt asking for the canonical
 * `{{P:id|name}}` form. Two shapes get fixed:
 *
 *  - `{{P:סמיר בן סעיד}}`  (Hebrew name where id should be, no pipe)
 *      → `{{P:samer-ben-saeed|סמיר בן סעיד}}`  if name found in map
 *      → `סמיר בן סעיד` (stripped to plain text)  if not
 *  - `{{P:netanyahu}}`     (id-only, no pipe)
 *      → `{{P:netanyahu|בנימין נתניהו}}`        if id found in id→name
 *      → `netanyahu` (stripped to plain text)   if not
 *
 * Why we strip on miss rather than leaving the broken marker: a raw
 * `{{P:...}}` showing up in published prose reads as a bug to readers.
 * Plain text is the safer fallback.
 *
 * Pass both maps (name→id and id→name) so we can handle either
 * malformed shape. Build them once from the same data the prompt
 * received, then forget about the AI's mistakes.
 */
export function repairPoliticianMarkers(
  body: string,
  nameToId: Map<string, string>,
  idToName: Map<string, string>,
): string {
  // Match anything that looks like {{P:...}} where the inner part has
  // no pipe — i.e. the malformed shape. Skip well-formed markers.
  return body.replace(/\{\{P:([^|}]+)\}\}/g, (_match, inner: string) => {
    const trimmed = inner.trim();
    // Try id-first (cheap exact lookup)
    const nameFromId = idToName.get(trimmed);
    if (nameFromId) return `{{P:${trimmed}|${nameFromId}}}`;
    // Try name-first lookup
    const idFromName = nameToId.get(trimmed);
    if (idFromName) return `{{P:${idFromName}|${trimmed}}}`;
    // Last resort: drop the marker, keep the inner text. Better than
    // showing readers a raw {{P:...}}.
    return trimmed;
  });
}
