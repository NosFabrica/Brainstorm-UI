// A tag's Trusted Lists, read from the SEARCH RELAY: who and what carries a tag, through a
// perspective, one list per kind of thing tagged.
//
// The trusted-list service builds them (brainstorm_server ADR trusted-lists/0002, 2026-11-03):
//
//   30392  the people carrying a tag             title "<tag>"                     members `p`
//   30393  events named by id (notes, pictures)  title "<tag> <what>", "stoicism Notes"
//   30394  events named by address (articles, a Dictionary list's items)
//                                                title "<tag> <what>", "Verified Human GitHub Accounts"
//
//   tags:    ["title", …] ["description", …] ["observer", <whose perspective>]
//            ["source-tag", <tag id or address>, <tag author>, <slug>]
//            ["tagging-target", <kind number> | <Dictionary list's header>]   — 30393/30394 only
//   content: {"members":[{pubkey | id | address, endorsements, disputes, score}]}  — best first
//
// The relay matches a list by its title alone, every searched word in it, so "verified human"
// finds the people's list and the GitHub Accounts' list both.
//
// Which perspective: the reader's own lists of a tag, when they have any; otherwise the house's,
// asked beside theirs (services/searchTags does the same for people).
//
// Whose lists count: asked through a perspective, the relay keeps the lists signed by the keys
// that perspective's kind-10040 names. The house's 10040 names the production server's assistant,
// so lists a staging server builds for the house never pass. The house's lists are therefore also
// asked unranked, from the assistant THIS deployment's server signs them with (its `/setup` rows),
// and the observer each names is checked here as the relay would. In production that is the key
// the 10040 already names, and the answer is the same lists again.

import type { NostrEvent } from "nostr-tools";
import { searchRelay } from "@/lib/searchRelay";
import { fetch, getBrainstormApi } from "@/services/api/core";
import type { Members, SearchHit } from "@/services/search";
import { collect, type Lens } from "@/services/searchTags";
import { resolveHouseObserver } from "@/services/trustSource";

export const PEOPLE_LIST_KIND = 30392;
export const EVENT_LIST_KIND = 30393;
export const ADDRESS_LIST_KIND = 30394;
export const TAG_LIST_KINDS = [PEOPLE_LIST_KIND, EVENT_LIST_KIND, ADDRESS_LIST_KIND];

/**
 * How many of a tag's people, events or addresses a search narrowed to it asks for, best first:
 * a REQ of 514 ids was answered whole (probed 2026-11-09), and the relay's answer is what counts.
 */
const MEMBERS_ASKED = 500;

/** Lists to ask for: a few tags, times the kinds of thing each is on, times the copies each can arrive in. */
const LISTS_LIMIT = 40;

export interface TagListMember {
  /** A pubkey (30392), an event id (30393) or an address `<kind>:<pubkey>:<d>` (30394). */
  target: string;
  endorsements: number;
  disputes: number;
  /** The 0–100 trust-weighted score through the list's perspective. */
  score: number;
}

export interface TagList {
  kind: number;
  /** `<tag author>|<slug>`: the tag, across every kind of thing it is on. */
  tagKey: string;
  authorPubkey: string;
  slug: string;
  title: string;
  description?: string;
  /** What it lists: "person", a kind ("1"), or a Dictionary list's header. */
  target: string;
  observer: string;
  members: TagListMember[];
}

const tagOf = (tags: string[][], name: string) => tags.find((t) => t[0] === name);
const num = (v: unknown) => (typeof v === "number" ? v : 0);

/** One list as the relay sent it, if it's a tag's list made through `observer`. */
export function readTagList(event: SearchHit["event"], observer: string): (TagList & { createdAt: number }) | null {
  if (!TAG_LIST_KINDS.includes(event.kind)) return null;
  if (tagOf(event.tags, "observer")?.[1] !== observer) return null;
  // The people's lists have a pinned variant beside the full one; it isn't the whole answer.
  if (tagOf(event.tags, "metric")?.[1] === "pinned-tag-membership") return null;
  const source = tagOf(event.tags, "source-tag");
  const authorPubkey = source?.[2];
  const slug = source?.[3];
  const title = tagOf(event.tags, "title")?.[1];
  const target = event.kind === PEOPLE_LIST_KIND ? "person" : tagOf(event.tags, "tagging-target")?.[1];
  if (!authorPubkey || !slug || !title || !target) return null;
  let raw: unknown;
  try {
    raw = (JSON.parse(event.content) as { members?: unknown }).members;
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;
  const field = event.kind === PEOPLE_LIST_KIND ? "pubkey" : event.kind === EVENT_LIST_KIND ? "id" : "address";
  const members: TagListMember[] = [];
  for (const m of raw as Array<Record<string, unknown>>) {
    const value = m?.[field];
    if (typeof value !== "string") continue;
    members.push({ target: value, endorsements: num(m.endorsements), disputes: num(m.disputes), score: num(m.score) });
  }
  return {
    kind: event.kind,
    tagKey: `${authorPubkey}|${slug}`,
    authorPubkey,
    slug,
    title,
    description: tagOf(event.tags, "description")?.[1] || undefined,
    target,
    observer,
    members,
    createdAt: event.created_at,
  };
}

/** The relay's answer as lists made through `observer`: one per tag and kind of thing, the newest copy. */
export function tagListsFromHits(hits: readonly SearchHit[], observer: string): TagList[] {
  const bySlot = new Map<string, TagList & { createdAt: number }>();
  for (const hit of hits) {
    const list = readTagList(hit.event, observer);
    if (!list) continue;
    const slot = `${list.kind}|${list.tagKey}|${list.target}`;
    const held = bySlot.get(slot);
    if (!held || list.createdAt > held.createdAt) bySlot.set(slot, list);
  }
  return [...bySlot.values()].map(({ createdAt: _createdAt, ...list }) => list);
}

/**
 * The reader's lists, and the house's of every tag they have none of their own for. Keyed on the
 * tag, not on what it's on: a reader whose web of trust put a tag on notes alone hasn't left their
 * perspective for the house's people.
 */
export function mergePerspectives(theirs: readonly TagList[], houses: readonly TagList[]): TagList[] {
  const held = new Set(theirs.map((l) => l.tagKey));
  return [...theirs, ...houses.filter((l) => !held.has(l.tagKey))];
}

/**
 * The tag's own name. The people's list is titled with it alone; a list of things adds what they
 * are ("stoicism Notes"), so its name is the title's first words, as many as the slug has.
 */
export function tagNameOf(lists: readonly TagList[]): string {
  const people = lists.find((l) => l.kind === PEOPLE_LIST_KIND);
  if (people) return people.title;
  const { title, slug } = lists[0];
  const words = title.split(/\s+/);
  const n = slug.split("-").filter(Boolean).length;
  return words.length > n ? words.slice(0, n).join(" ") : title;
}

const memo = new Map<string, Promise<TagList[]>>();
const signers = new Map<string, Promise<string | null>>();

/** Test seam: forget every answer. */
export function forgetTagLists(): void {
  memo.clear();
  signers.clear();
}

const HEX64 = /^[0-9a-f]{64}$/i;
const ASK_MS = 4000;

/**
 * Who this deployment's server signs `observer`'s Trusted Lists as: its `/setup` row for them. Null if it
 * won't say. Asked without a session: it needs none, and a reader who isn't signed in is most readers.
 */
function signerHere(observer: string): Promise<string | null> {
  let pending = signers.get(observer);
  if (!pending) {
    pending = fetch(`${getBrainstormApi()}/setup/${observer}`, { signal: AbortSignal.timeout(ASK_MS) })
      .then((response) => (response.ok ? (response.json() as Promise<unknown>) : []))
      .then((rows) => {
        if (!Array.isArray(rows)) return null;
        const row = (rows as unknown[]).find(
          (r): r is string[] => Array.isArray(r) && TAG_LIST_KINDS.map(String).includes(r[0]),
        );
        const key = row?.[1];
        return key && HEX64.test(key) ? key : null;
      })
      .catch(() => null);
    signers.set(observer, pending);
  }
  return pending;
}

/** The tag lists one key signed whose titles hold `words`, unranked: every observer's, for the caller to keep its own. */
function listsSignedBy(words: string, signer: string): Promise<SearchHit[]> {
  return new Promise((resolve) => {
    const relay = searchRelay();
    if (!relay) return resolve([]);
    const found: NostrEvent[] = [];
    let done = false;
    let sub: { unsubscribe(): void } | undefined;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sub?.unsubscribe();
      resolve(found.map((event) => ({ event, author: null, rank: null })));
    };
    const timer = setTimeout(finish, ASK_MS);
    sub = relay
      .req({ kinds: TAG_LIST_KINDS, authors: [signer], search: `${words} include:spam`, limit: LISTS_LIMIT })
      .subscribe({
        next: (msg: { type: string; event?: NostrEvent }) => {
          if (msg.type === "EVENT" && msg.event) found.push(msg.event);
          else if (msg.type === "EOSE" || msg.type === "CLOSED") finish();
        },
        error: finish,
      });
    if (done) sub.unsubscribe();
  });
}

/** The house's lists: those its 10040 names a signer for, and those this deployment's server built for it. */
async function houseLists(words: string): Promise<TagList[]> {
  const house = await resolveHouseObserver();
  if (!house) return [];
  const [ranked, builtHere] = await Promise.all([
    collect(words, { pov: "nosfabrica" }, TAG_LIST_KINDS, LISTS_LIMIT),
    signerHere(house).then((signer) => (signer ? listsSignedBy(words, signer) : [])),
  ]);
  return tagListsFromHits([...ranked, ...builtHere], house);
}

/**
 * The tag lists whose titles hold every one of `words`, through the reader's perspective (the
 * house's for a tag they have none of). Asked once per visit for the same words and perspective;
 * never rejects.
 */
export function fetchTagLists(words: string, lens: Lens): Promise<TagList[]> {
  const asked = words.trim();
  if (asked.length < 2) return Promise.resolve([]);
  const own = lens.pov === "mywot" && lens.userPubkey ? lens.userPubkey : null;
  const key = `${own ?? "house"}|${asked.toLowerCase()}`;
  let pending = memo.get(key);
  if (!pending) {
    pending = ask(asked, own, lens).catch(() => []);
    memo.set(key, pending);
  }
  return pending;
}

async function ask(words: string, own: string | null, lens: Lens): Promise<TagList[]> {
  const [ownHits, houses] = await Promise.all([
    own ? collect(words, lens, TAG_LIST_KINDS, LISTS_LIMIT) : Promise.resolve([]),
    houseLists(words),
  ]);
  return mergePerspectives(own ? tagListsFromHits(ownHits, own) : [], houses);
}

/** Everything `lists` say carries the tag `tagKey`, best first by kind of thing; null when none is the tag's. */
export function membersOf(lists: readonly TagList[], tagKey: string): Members | null {
  const own = lists.filter((l) => l.tagKey === tagKey);
  if (!own.length) return null;
  const of = (kind: number) =>
    [
      ...new Set(
        own
          .filter((l) => l.kind === kind)
          .flatMap((l) => l.members)
          .sort((a, b) => b.score - a.score)
          .map((m) => m.target),
      ),
    ].slice(0, MEMBERS_ASKED);
  return { pubkeys: of(PEOPLE_LIST_KIND), ids: of(EVENT_LIST_KIND), addresses: of(ADDRESS_LIST_KIND) };
}

/**
 * Who and what carries one tag, through the reader's perspective (the house's where they have no
 * list of it): its lists, asked by its name — every word of which is in each list's title — and
 * kept to the tag itself. Null when the tag has no list yet. Never rejects.
 */
export async function fetchTagMembers(tag: { key: string; name: string }, lens: Lens): Promise<Members | null> {
  return membersOf(await fetchTagLists(tag.name, lens), tag.key);
}
