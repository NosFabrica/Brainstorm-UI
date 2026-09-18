/**
 * Which NIP-29 group somebody means by `group:chachi`, with no DOM and no relay in it.
 *
 * A group is the pair (id, host), while the `group:` token carries the bare id — so two rooms
 * on two relays can share an id and a search on it returns both. Rows that share an id are
 * marked `ambiguous` rather than merged, because either one writes the same `#h`.
 *
 * Ported from the relay's own operator field (`web/shared/groups.js`), minus the reader's
 * kind-10009 list: this client has no signer wired into the search box, so only the public
 * kind-39000 metadata the relay holds is offered.
 */
import type { NostrEvent } from "nostr-tools";

export interface GroupCandidate {
  id: string;
  /** The relay key that signed the metadata — a group's host. */
  host: string | null;
  name: string;
  about: string;
  picture: string;
  /** More than one row here carries this id, so a pick filters on an id two rooms answer to. */
  ambiguous?: boolean;
}

/** A tag's value at [i], trimmed to nothing when it is absent or blank. */
const at = (tag: string[], i: number) => (tag.length > i ? String(tag[i] || "").trim() : "");

/** The group an event was posted to (NIP-29's `h` tag), or "". The bare id: the host is nowhere in the message. */
export const postedTo = (ev: { tags?: string[][] }): string => {
  const tag = (ev?.tags || []).find((t) => Array.isArray(t) && t[0] === "h");
  return tag ? at(tag, 1) : "";
};

/** One kind-39000 as a candidate: its `d` is the id, its author is the host. */
export function metaGroup(ev: NostrEvent | null | undefined): GroupCandidate | null {
  if (!ev || ev.kind !== 39000) return null;
  const tags = ev.tags || [];
  const first = (name: string) => {
    const t = tags.find((x) => Array.isArray(x) && x[0] === name);
    return t ? at(t, 1) : "";
  };
  const id = first("d");
  if (!id) return null;
  return { id, host: ev.pubkey || null, name: first("name"), about: first("about"), picture: first("picture") };
}

/**
 * The rows to offer for a half-typed `group:`, best first: an exact id, then everything the
 * relay found, in the relay's order. `ambiguous` marks every row sharing its id with another.
 */
export function rank(partial: string, meta: GroupCandidate[]): GroupCandidate[] {
  const typed = String(partial ?? "");
  const rows: GroupCandidate[] = [];
  const seen = new Set<string>();
  // Both halves are free-form, so the separator is the escape `\u0000`, never the byte.
  const take = (c: GroupCandidate) => {
    const k = `${c.id}\u0000${c.host ?? ""}`;
    if (seen.has(k)) return;
    seen.add(k);
    rows.push(c);
  };
  if (typed) for (const c of meta) if (c.id === typed) take(c);
  for (const c of meta) take(c);

  const times = new Map<string, number>();
  for (const c of rows) times.set(c.id, (times.get(c.id) || 0) + 1);
  return rows.map((c) => ({ ...c, ambiguous: (times.get(c.id) ?? 0) > 1 }));
}

/** What a row says about where it is; [hostName] is passed in because this module holds no caches. */
export function where(cand: GroupCandidate, hostName = ""): string {
  const named = String(hostName || "").trim();
  if (named) return named;
  return cand.host ? `relay ${cand.host.slice(0, 8)}…` : "unknown relay";
}

// ---- what a group is called ------------------------------------------------
//
// id -> host key -> name. An id is named only where every host that answered for it agrees:
// two relays calling the same id two different things can be drawn as neither.

const learned = new Map<string, Map<string, string>>();

/** Record what these candidates say they are called. Returns how many ids draw differently now. */
export function seedGroupNames(cands: (GroupCandidate | null)[]): number {
  const was = new Map<string, string>();
  for (const c of cands) {
    if (!c?.id) continue;
    const name = String(c.name || "").trim();
    if (!name) continue;
    if (!was.has(c.id)) was.set(c.id, groupName(c.id));
    const by = learned.get(c.id) ?? new Map<string, string>();
    by.set(c.host ?? "", name);
    learned.set(c.id, by);
  }
  let changed = 0;
  for (const [id, before] of was) if (groupName(id) !== before) changed++;
  return changed;
}

/** The same, from the kind 39000s among raw events. */
export const seedGroupEvents = (events: NostrEvent[]): number =>
  seedGroupNames(events.map(metaGroup));

/** What to draw for this id, or "" when nothing can be said with one name. */
export function groupName(id: string): string {
  const by = learned.get(id);
  if (!by) return "";
  const names = new Set(by.values());
  return names.size === 1 ? [...names][0] : "";
}

/** Has anybody answered for this id at all? A pill asks before it sends a lookup. */
export const knowsGroup = (id: string): boolean => learned.has(id);

/** Test seam: the cache outlives a component, so a test has to be able to empty it. */
export const forgetGroupNames = (): void => learned.clear();
