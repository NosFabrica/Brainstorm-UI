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

import type { SearchHit } from "@/services/search";
import { collect, type Lens } from "@/services/searchTags";
import { resolveHouseObserver } from "@/services/trustSource";

export const PEOPLE_LIST_KIND = 30392;
export const EVENT_LIST_KIND = 30393;
export const ADDRESS_LIST_KIND = 30394;
export const TAG_LIST_KINDS = [PEOPLE_LIST_KIND, EVENT_LIST_KIND, ADDRESS_LIST_KIND];

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

/** Test seam: forget every answer. */
export function forgetTagLists(): void {
  memo.clear();
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
  const [houseObserver, ownHits, houseHits] = await Promise.all([
    resolveHouseObserver(),
    own ? collect(words, lens, TAG_LIST_KINDS, LISTS_LIMIT) : Promise.resolve([]),
    collect(words, { pov: "nosfabrica" }, TAG_LIST_KINDS, LISTS_LIMIT),
  ]);
  return mergePerspectives(
    own ? tagListsFromHits(ownHits, own) : [],
    houseObserver ? tagListsFromHits(houseHits, houseObserver) : [],
  );
}
