/**
 * Copies and look-alikes in a list's search results. Two copies of one thing
 * — the same GitHub account filed by two people — are one result, carrying
 * the ids of every copy so their endorsements add up. Two branches of one
 * chain are two places: kept apart, and told apart by their street when
 * their rows would otherwise read the same.
 */

/** The first of each thing, in the order given, with the ids of all its copies. A null identity never merges. */
export function collapseSameThing<T extends { id: string }>(
  hits: readonly T[],
  identityOf: (hit: T) => string | null,
): (T & { copies: string[] })[] {
  const out: (T & { copies: string[] })[] = [];
  const byKey = new Map<string, T & { copies: string[] }>();
  for (const hit of hits) {
    const key = identityOf(hit);
    const held = key ? byKey.get(key) : undefined;
    if (held) {
      held.copies.push(hit.id);
      continue;
    }
    const first = { ...hit, copies: [hit.id] };
    if (key) byKey.set(key, first);
    out.push(first);
  }
  return out;
}

/** Each row's line, with the street added where two rows' titles and lines are the same. */
export function tellApart(rows: readonly { title: string; line: string; street: string | null }[]): string[] {
  const seen = new Map<string, number>();
  for (const r of rows) seen.set(`${r.title}\n${r.line}`, (seen.get(`${r.title}\n${r.line}`) ?? 0) + 1);
  return rows.map((r) =>
    (seen.get(`${r.title}\n${r.line}`) ?? 0) > 1 && r.street ? (r.line ? `${r.line} · ${r.street}` : r.street) : r.line,
  );
}
