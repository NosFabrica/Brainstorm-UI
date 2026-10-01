// The tags a search matches, read from the SEARCH RELAY.
//
// Search used to find tags by walking the whole catalogue on the tag hub —
// megabytes, and the better part of half a minute before the first tag row.
// The relay now holds each tag as a list of the people who carry it, per
// perspective, and answers by the words in well under a second.
//
// ## The event (kind 30392, probed 2026-10-01)
//
//   tags:    ["title", name] ["description", …] ["metric", "tag-membership"]
//            ["observer", <whose perspective>]
//            ["source-tag", <id>, <tag author pubkey>, <slug>]
//            ["p", <member>, "", <score>] …
//   content: {"members":[{pubkey, endorsements, disputes, score}]}  — best first
//
// ## What the relay leaves to us
//
// - A lists-only ask comes back with EVERY observer's copy of a matching
//   list, so we keep the ones made for the perspective we asked through.
// - One tag can arrive several times (more than one signer, and a "pinned"
//   variant beside the full one): the full list wins, then the newest.
// - Asked for profiles too (kinds 0 and 30392), each list's people follow it,
//   ahead of the ordinary name matches. We attach them to their members and
//   leave the name matches to whoever asked for people.
//
// The browse page, the tag page, profile tags and the tag picker still read
// the hub: they need every tag and who applied it, which this does not carry.

import { searchStream, type SearchHit, type SearchPov, type SearchSnapshot } from "@/services/search";
import { resolveHouseObserver } from "@/services/trustSource";
import type { SearchResult } from "@/lib/profileSearch";
import type { TagSummary } from "@/services/tags";

export const TAG_LIST_KIND = 30392;

/** How many lists to ask for: a few tags, times the copies each can arrive in. */
const LIST_LIMIT = 12;
const TIMEOUT_MS = 4000;

export interface SearchTagMember {
  pubkey: string;
  endorsements: number;
  disputes: number;
  /** The relay's 0–100 score for this person on this tag, through this perspective. */
  score: number | null;
  /** Their profile, when the ask was for people too and the relay sent it. */
  profile?: SearchResult;
}

/** A tag the words matched, with the people who carry it, best first. */
export interface SearchTag extends TagSummary {
  members: SearchTagMember[];
}

interface Lens {
  pov: SearchPov;
  /** Required for pov === "mywot". */
  userPubkey?: string;
}

const memo = new Map<string, Promise<SearchTag[]>>();

/** Drop what this session has learned — tests, and nothing else. */
export function forgetSearchTags(): void {
  memo.clear();
}

/**
 * The tags `query` matches, through the reader's perspective. Asked once per
 * session for the same words, perspective and form; never rejects — a search
 * with no tag row beats a broken one.
 */
export function fetchSearchTags(query: string, lens: Lens, opts: { members?: boolean } = {}): Promise<SearchTag[]> {
  const words = query.trim();
  if (words.length < 2) return Promise.resolve([]);
  const members = opts.members === true;
  const key = `${lens.pov === "mywot" ? (lens.userPubkey ?? "") : "house"}|${members ? "people" : "lists"}|${words.toLowerCase()}`;
  let pending = memo.get(key);
  if (!pending) {
    pending = ask(words, lens, members).catch(() => []);
    memo.set(key, pending);
  }
  return pending;
}

async function ask(words: string, lens: Lens, members: boolean): Promise<SearchTag[]> {
  const observer = lens.pov === "mywot" && lens.userPubkey ? lens.userPubkey : await resolveHouseObserver();
  if (!observer) return [];
  const hits = await collect(words, lens, members ? [0, TAG_LIST_KIND] : [TAG_LIST_KIND]);
  return tagsFromHits(hits, observer);
}

/** Everything the relay sends up to EOSE, an error or the deadline. */
function collect(words: string, lens: Lens, kinds: number[]): Promise<SearchHit[]> {
  return new Promise((resolve) => {
    let latest: SearchHit[] = [];
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel: (() => void) | undefined;
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cancel?.();
      resolve(latest);
    }
    cancel = searchStream(
      words,
      { tab: "people", pov: lens.pov, userPubkey: lens.userPubkey, kinds, limit: LIST_LIMIT },
      (snapshot: SearchSnapshot) => {
        latest = snapshot.hits;
        if (snapshot.eose || snapshot.error) finish();
      },
    );
    if (done) cancel();
    else timer = setTimeout(finish, TIMEOUT_MS);
  });
}

const tagOf = (tags: string[][], name: string) => tags.find((t) => t[0] === name);

function readList(hit: SearchHit, observer: string): (SearchTag & { full: boolean; createdAt: number }) | null {
  const { event } = hit;
  if (event.kind !== TAG_LIST_KIND) return null;
  if (tagOf(event.tags, "observer")?.[1] !== observer) return null;
  const source = tagOf(event.tags, "source-tag");
  const authorPubkey = source?.[2];
  const slug = source?.[3];
  const name = tagOf(event.tags, "title")?.[1];
  if (!authorPubkey || !slug || !name) return null;
  let raw: unknown;
  try {
    raw = (JSON.parse(event.content) as { members?: unknown }).members;
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;
  const members: SearchTagMember[] = [];
  for (const m of raw as Array<Record<string, unknown>>) {
    if (!m || typeof m.pubkey !== "string") continue;
    members.push({
      pubkey: m.pubkey,
      endorsements: typeof m.endorsements === "number" ? m.endorsements : 0,
      disputes: typeof m.disputes === "number" ? m.disputes : 0,
      score: typeof m.score === "number" ? m.score : null,
    });
  }
  return {
    key: `${authorPubkey}|${slug}`,
    authorPubkey,
    slug,
    name,
    description: tagOf(event.tags, "description")?.[1] || undefined,
    people: members.length,
    vouches: members.reduce((n, m) => n + m.endorsements, 0),
    sharesName: 1,
    // The relay only lists what this perspective counts; nothing to flag.
    unverified: false,
    members,
    full: tagOf(event.tags, "metric")?.[1] !== "pinned-tag-membership",
    createdAt: event.created_at,
  };
}

/** The relay's answer as tags: one per tag, in the order the relay first named it. */
export function tagsFromHits(hits: readonly SearchHit[], observer: string): SearchTag[] {
  const byKey = new Map<string, SearchTag & { full: boolean; createdAt: number }>();
  for (const hit of hits) {
    const list = readList(hit, observer);
    if (!list) continue;
    const held = byKey.get(list.key);
    const better = !held || (list.full !== held.full ? list.full : list.createdAt > held.createdAt);
    // Replacing in place keeps the position the relay first gave this tag.
    if (better) byKey.set(list.key, list);
  }
  const profiles = new Map<string, SearchResult>();
  for (const hit of hits) if (hit.event.kind === 0 && hit.author) profiles.set(hit.event.pubkey, hit.author);
  return [...byKey.values()].map(({ full: _full, createdAt: _createdAt, ...tag }) => ({
    ...tag,
    members: profiles.size
      ? tag.members.map((m) => (profiles.has(m.pubkey) ? { ...m, profile: profiles.get(m.pubkey) } : m))
      : tag.members,
  }));
}
