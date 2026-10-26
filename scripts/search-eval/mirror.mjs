/**
 * Pure pieces of the app that the eval runner (baseline.mjs) mirrors, kept apart from the script so they can be
 * tested (`npm test`). Each says which app file it follows; when that file changes, this one has to follow.
 */

/** NIP-01: one current version per address, the newest; on a tie the lower id (lib/newestPerAddress). */
function addressOf(ev) {
  if (ev.kind >= 30000 && ev.kind < 40000)
    return `${ev.kind}:${ev.pubkey}:${ev.tags.find((t) => t[0] === "d")?.[1] ?? ""}`;
  if (ev.kind === 0 || ev.kind === 3 || (ev.kind >= 10000 && ev.kind < 20000)) return `${ev.kind}:${ev.pubkey}:`;
  return ev.id;
}
const beats = (a, b) => a.created_at > b.created_at || (a.created_at === b.created_at && a.id < b.id);
export function newestPerAddress(events) {
  const byAddress = new Map();
  for (const ev of events) {
    const held = byAddress.get(addressOf(ev));
    if (!held || beats(ev, held)) byAddress.set(addressOf(ev), ev);
  }
  return [...byAddress.values()];
}

const HEX64 = /^[0-9a-f]{64}$/;
const valueOf = (ev, name) => ev.tags.find((t) => t[0] === name)?.[1];
/** lib/conceptResolution B_DEFERRED: a `b` that defers its target is not a link. */
const B_DEFERRED = "b-tag-deferred";
const coordinateOf = (ev) => {
  const d = valueOf(ev, "d");
  return d == null ? null : `${ev.kind}:${ev.pubkey}:${d}`;
};
/** A header that points at itself (lib/conceptResolution isSelfDeclared, bLinksOf). */
const isSelfDeclared = (ev) => {
  const own = coordinateOf(ev);
  return !!own && ev.tags.some((t) => t[0] === "b" && t[1] && t[1] !== B_DEFERRED && t[1] === own);
};
/** lib/dlistFields headerNames: the plural name, which the Dictionary orders by. */
const pluralOf = (ev) => {
  const names = ev.tags.find((t) => t[0] === "names");
  return names?.[2] || names?.[1] || valueOf(ev, "name") || valueOf(ev, "d") || "";
};

/**
 * Who curates the Dictionary (lib/dictionaryConcepts curatorsOf): everyone the house tagged with the curator tag,
 * unless its newest tagging disputes them (a `polarity` below 0.5). The house curates only if it tagged itself.
 */
export function curatorsOf(events, { house, curatorTag }) {
  if (!house) return [];
  const taggings = events.filter(
    (ev) => ev.kind === 39999 && ev.pubkey === house && ev.tags.some((t) => t[0] === "a" && t[1] === curatorTag),
  );
  const curators = new Set();
  for (const ev of newestPerAddress(taggings)) {
    const person = valueOf(ev, "p")?.toLowerCase();
    if (person && HEX64.test(person) && Number(valueOf(ev, "polarity") ?? "1") >= 0.5) curators.add(person);
  }
  return [...curators];
}

/**
 * What the Dictionary shows (lib/dictionaryConcepts conceptsOf, hooks/useDictionaryConcepts), from the events read
 * for it: the curators' newest kind-39998 headers that point at themselves, the role concepts aside. Ordered by
 * name, then coordinate.
 */
export function dictionaryConcepts(events, { house, curatorTag, roles = [] }) {
  const curators = new Set(curatorsOf(events, { house, curatorTag }));
  return newestPerAddress(events.filter((ev) => ev.kind === 39998 && curators.has(ev.pubkey)))
    .filter(isSelfDeclared)
    .map((ev) => [coordinateOf(ev), pluralOf(ev).trim()])
    .filter(([coordinate]) => !roles.includes(coordinate))
    .sort(([a, an], [b, bn]) => an.localeCompare(bn, undefined, { sensitivity: "base" }) || (a < b ? -1 : 1))
    .map(([coordinate]) => coordinate);
}

const norm = (s) => (s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/**
 * Whether an item has every property an entry's filter names. A tag the item carries more than once (a place's
 * cuisines) matches on any of its values; a value can also be a `;` or `,` list, and `_` reads as a space.
 */
export function propertyMatches(ev, prop) {
  return Object.entries(prop).every(([k, v]) => {
    const want = norm(String(v));
    return ev.tags
      .filter((t) => t[0] === k && t.length > 1)
      .some((t) => {
        const val = norm(t[1]);
        return (
          val === want ||
          val
            .replace(/_/g, " ")
            .split(/[;,]\s*/)
            .includes(want.replace(/_/g, " "))
        );
      });
  });
}
