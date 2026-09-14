/**
 * The words of a note as a title: without the links it carries, without the
 * raw `nostr:` references a client would render as names, first line only,
 * trimmed of a dangling "WITH" or "AND" the stripping leaves behind.
 */
export function noteTitle(content: string, max = 90): string {
  const first =
    content
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/nostr:[a-z0-9]+/gi, " ")
      .replace(/[ \t]+/g, " ")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)[0] ?? "";
  // Stripping two mentions leaves "… WITH AND": peel connectors until none dangle.
  let clean = first.trim();
  for (let guard = 0; guard < 4; guard++) {
    const next = clean.replace(/[\s,]+(and|&|with|w\/|feat\.?|ft\.?)$/i, "").trim();
    if (next === clean) break;
    clean = next;
  }
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}
