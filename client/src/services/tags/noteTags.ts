/** Tagging notes and other events (rung C2): their tags in one batched pass, a tag's notes, and applying one. */
import type { TagTarget } from "@/lib/tagTarget";
import {
  applyEventTagging,
  classifyEventTaggings,
  filterTaggingHeadersForTag,
  filterTagsAppliedToEvent,
  groupTaggingsByTarget,
} from "@/lib/tagging-sdk/event-tagging/index.js";
import type { Polarity } from "@/lib/tagging-sdk/profile-tagging.js";
import { stanceOnlyRefs } from "@/lib/tagCounts";
import { Z_HANDLE_PUBKEYS } from "@/config/tagging";
import { activeAccount, requireActiveAccount, signAs } from "@/accounts/signing";
import { fetchAllTagEvents, fetchTagEvents } from "./read";
import { publishTagEvent, readBack } from "./publish";
import { resolveTrust, type TrustObserver } from "./trust";
import { resolveTagNames } from "./elements";
import { headerCoordOf, holdHeader, resolveTaggingHeaders } from "./headers";
import { netPositive, TAG_ELEMENT_KIND, tagValue, type NostrEvent, type TagIdentity } from "./shared";

/**
 * Note tagging is shaped differently from profile tagging, and the difference is
 * the whole reason this section exists rather than reusing the code above.
 *
 * A profile assertion names its tag directly (`a` = `39999:<author>:<slug>`). An
 * EVENT assertion names a **per-tag tagging header** instead
 * (`z` = `39999:<headerAuthor>:tagging:<slug>-tagging`), and that header carries
 * the `a` pointing at the tag-element. So reading tags on a note is a two-hop
 * resolution, and the middle hop is what decides legitimacy: a candidate counts
 * only if its header joins a `tagging-with-specific-tag` namespace we honor.
 *
 * That indirection is also why applying a tag to a note can cost 1, 2 or 3
 * publishes — assertion alone, header + assertion, or tag + header + assertion.
 * `applyEventTagging` picks the sequence; we just supply the deps.
 *
 * An assertion whose header we can't resolve is **unverifiable**, not invalid.
 * The SDK surfaces those separately and we pass the count through rather than
 * silently dropping them — a header that hasn't propagated yet looks exactly
 * like one that never existed, and only one of those is the reader's business.
 */

/** One tag as it appears on a note. */
export interface NoteTag extends TagIdentity {
  key: string;
  /** Distinct asserters who applied it. */
  applications: number;
  /** Distinct asserters who disputed it. */
  disputes: number;
  /** Who applied it, for attribution. */
  asserters: string[];
  /** Whether the net rule carries it. */
  counted: boolean;
  /** The viewer's own stance, shown regardless of whether the POV counts them. */
  myStance?: "apply" | "dispute";
}

export interface NoteTagsResult {
  tags: NoteTag[];
  mine: Array<{ key: string; stance: "apply" | "dispute" }>;
  /**
   * Assertions we found but whose tagging header wouldn't resolve. Reported, not
   * dropped — a non-zero count here means a header fetch missed a relay, which
   * is the kit's stated diagnostic for exactly this.
   */
  unverifiable: number;
  /** The trust source told us nothing — these counts weren't filtered. */
  trustUnverified: boolean;
}

/**
 * Collapse replaceable duplicates before classifying. An event-tagging's `d` is
 * deterministic per (slug, target, asserter), so a relay handing us both the old
 * and the new copy must not count as two — and an apply↔dispute flip has to
 * settle on the newer stance. The SDK's classifier documents this as the
 * caller's job.
 */
export function latestByReplaceableKey(events: NostrEvent[]): NostrEvent[] {
  const latest = new Map<string, NostrEvent>();
  for (const ev of events) {
    const d = tagValue(ev, "d");
    if (!d) continue;
    const key = `${ev.kind}|${ev.pubkey}|${d}`;
    const prev = latest.get(key);
    if (!prev || ev.created_at > prev.created_at) latest.set(key, ev);
  }
  return Array.from(latest.values());
}

/** The descriptor coordinate a candidate assertion points at, if it has one. */
export function descriptorOf(ev: NostrEvent): string | null {
  const z = (ev.tags || []).find((t) => t[0] === "z" && /^39999:[0-9a-f]{64}:tagging:.+-tagging$/.test(t[1] || ""));
  return z ? z[1] : null;
}

const EMPTY_NOTE_TAGS: NoteTagsResult = {
  tags: [],
  mine: [],
  unverifiable: 0,
  trustUnverified: false,
};

/** The event id a candidate assertion targets, if it targets one by id. */
export function targetIdOf(ev: NostrEvent): string | null {
  const e = (ev.tags || []).find((t) => t[0] === "e");
  return e?.[1] ?? null;
}

/** An addressable event's coordinate (`<kind>:<pubkey>:<d>`), told from a 64-hex event id. */
const isCoordinate = (target: string) => target.includes(":");

/** The longest filter value the hub (strfry) takes. */
const FILTER_ITEM_BYTES = 255;
const utf8Length = (s: string) => new TextEncoder().encode(s).length;

/** The coordinate a tagging names in its `a` tag, when it names one. */
export function targetAddressOf(ev: NostrEvent): string | null {
  const a = (ev.tags || []).find((t) => t[0] === "a");
  return a?.[1] ?? null;
}

/**
 * Every tag applied to each of N notes, in ONE pass (ACCEPTANCE C2).
 *
 * Batched on purpose, and the checklist is explicit about why: "reads over a
 * list of N events issue batched queries … no per-event REQ storm". A profile
 * page renders half a dozen notes, so a per-note read would be half a dozen
 * REQs where one will do — and the header, trust and name resolution behind
 * them would each multiply too.
 *
 * Anonymous-safe like every read here: relays only, no API client. Pass
 * `viewerPubkey` to surface the viewer's own stances via the `mine` channel,
 * which is deliberately trust-unfiltered.
 *
 * Returns a map keyed by event id. Ids with no tags are simply absent.
 *
 * An entry may be an addressable event's coordinate instead (a Dictionary list
 * item, an article): its taggings point at it by `a`, and its answer is keyed by
 * the coordinate.
 */
export async function fetchEventTagsBatch(
  eventIds: string[],
  viewerPubkey?: string,
  observer: TrustObserver = "house",
  /**
   * An addressable event's coordinate, by its id (#334): its taggings are read
   * by coordinate as well as by id — what is written now, and what was written
   * before — and counted under the id.
   */
  addresses: Record<string, string> = {},
): Promise<Map<string, NoteTagsResult>> {
  const out = new Map<string, NoteTagsResult>();
  // A value past the hub's size limit fails its whole REQ ("filter item too
  // large", 2026-10-29: an article whose `d` is a 300-character URL emptied a
  // search's every tag). A tagging couldn't name such a target there anyway.
  const ids = Array.from(new Set(eventIds.filter((t) => t && FILTER_ITEM_BYTES >= utf8Length(t))));
  if (!ids.length) return out;
  const wanted = new Set(ids);
  const idByAddress = new Map(
    Object.entries(addresses)
      .filter(([id, address]) => ids.includes(id) && address)
      .map(([id, address]) => [address, id]),
  );

  // One REQ per chunk, never per note. 200 keeps the filter under the size
  // most relays accept while still collapsing any realistic page to one query.
  const candidates: NostrEvent[] = [];
  const chunks: Array<{ target: { id: string } | { address: string }; key: "#e" | "#a"; values: string[] }> = [];
  const byId = ids.filter((t) => !isCoordinate(t));
  const byAddress = ids.filter(isCoordinate);
  for (let i = 0; i < byId.length; i += 200)
    chunks.push({ target: { id: byId[i] }, key: "#e", values: byId.slice(i, i + 200) });
  for (let i = 0; i < byAddress.length; i += 200)
    chunks.push({ target: { address: byAddress[i] }, key: "#a", values: byAddress.slice(i, i + 200) });
  for (const chunk of chunks) {
    // The SDK owns the filter's shape; we only widen `#e` (or `#a`) from one
    // target to the chunk, which is exactly the batching the checklist asks for.
    const filter = filterTagsAppliedToEvent({ target: chunk.target }) as Record<string, unknown>;
    try {
      candidates.push(...(await fetchTagEvents({ ...filter, [chunk.key]: chunk.values })));
    } catch {
      // Partial results beat none; the notes we couldn't ask about just show
      // no chips, which is what an untagged note looks like anyway.
    }
  }
  const coords = Array.from(idByAddress.keys());
  for (let i = 0; i < coords.length; i += 200) {
    const chunk = coords.slice(i, i + 200);
    const filter = filterTagsAppliedToEvent({ target: { address: chunk[0] } }) as Record<string, unknown>;
    try {
      candidates.push(...(await fetchTagEvents({ ...filter, "#a": chunk })));
    } catch {
      // As above: an item we couldn't ask about by coordinate keeps what its id found.
    }
  }
  if (!candidates.length) return out;

  const deduped = latestByReplaceableKey(candidates);

  // Headers, trust and names all resolve ONCE across every note — the whole
  // point of batching. Notes on a profile tend to share tags, so this is where
  // most of the saving actually lands.
  const headers = await resolveTaggingHeaders(deduped.map(descriptorOf).filter((c): c is string => !!c));
  const trust = await resolveTrust(Array.from(new Set(deduped.map((ev) => ev.pubkey))), observer);

  const byTarget = new Map<string, NostrEvent[]>();
  for (const ev of deduped) {
    // By id; else by coordinate, filed under the item's id when the page asked by both (#334), or
    // under the coordinate when that is what was asked (a search result's address).
    const byId = targetIdOf(ev);
    const address = targetAddressOf(ev);
    const target = byId && wanted.has(byId) ? byId : address ? (idByAddress.get(address) ?? address) : null;
    if (!target || !wanted.has(target)) continue;
    if (!byTarget.has(target)) byTarget.set(target, []);
    byTarget.get(target)!.push(ev);
  }
  if (!byTarget.size) return out;

  // `classifyEventTaggings` groups one target's candidates by tag, so it runs
  // per note — but on already-fetched data, with no further I/O.
  const classifiedByTarget = new Map<string, ReturnType<typeof classifyEventTaggings>>();
  const refs = new Map<string, { authorPubkey: string; slug: string }>();
  for (const [target, evs] of byTarget) {
    const classified = classifyEventTaggings({
      candidates: evs,
      headers,
      honoredAuthorities: Z_HANDLE_PUBKEYS,
      isAsserterTrusted: trust.predicate,
      viewerPubkey,
    });
    classifiedByTarget.set(target, classified);
    // Names for the counted tags AND for the viewer's own — a tag that survives
    // only via `mine` still has to render under its real name, not its slug.
    for (const t of [...classified.tags, ...classified.mine]) {
      refs.set(`${t.tag.authorPubkey}|${t.tag.slug}`, {
        authorPubkey: t.tag.authorPubkey,
        slug: t.tag.slug,
      });
    }
  }

  const names = await resolveTagNames(Array.from(refs.values()));

  for (const [target, classified] of classifiedByTarget) {
    const mine = new Map(
      classified.mine.map((m) => [`${m.tag.authorPubkey}|${m.tag.slug}`, m.stance as "apply" | "dispute"]),
    );

    // `classified.tags` is trust-filtered; `classified.mine` is not. A tag whose
    // only asserter is the viewer — and whom the POV doesn't count — is absent
    // from the former and present in the latter, so mapping over `tags` alone
    // makes the viewer's own action vanish. ACCEPTANCE C7 and Floor C both
    // require the opposite: the viewer's stance stays visible whatever the POV
    // makes of them. So `mine` INTRODUCES an entry here, it doesn't just
    // annotate one.
    const fromMine = stanceOnlyRefs(classified.tags, classified.mine).map((m) => ({
      tag: m.tag,
      applications: [],
      disputes: [],
    }));

    const tags: NoteTag[] = [...classified.tags, ...fromMine]
      .map((t) => {
        const key = `${t.tag.authorPubkey}|${t.tag.slug}`;
        // Distinct ASSERTERS, not raw entries — the same discipline as the
        // profile read, and the only reading that matches the kit's rule.
        const applied = new Set(t.applications.map((a) => a.authorPubkey));
        const disputed = new Set(t.disputes.map((d) => d.authorPubkey));
        return {
          key,
          authorPubkey: t.tag.authorPubkey,
          slug: t.tag.slug,
          name: names.get(key)?.name || t.tag.slug,
          description: names.get(key)?.description,
          applications: applied.size,
          disputes: disputed.size,
          asserters: Array.from(applied),
          counted: netPositive(applied.size, disputed.size),
          myStance: mine.get(key),
        };
      })
      // Same rule as the profile chips: carried by the network, or the viewer
      // has a stance on it and must keep seeing their own action.
      .filter((t) => t.counted || !!t.myStance)
      .sort(
        (a, b) =>
          Number(b.counted) - Number(a.counted) || b.applications - a.applications || a.name.localeCompare(b.name),
      );

    out.set(target, {
      tags,
      mine: Array.from(mine.entries()).map(([key, stance]) => ({ key, stance })),
      unverifiable: classified.unverifiable.length,
      trustUnverified: trust.unverified,
    });
  }

  return out;
}

/**
 * Every tag applied to ONE note. A thin wrapper over the batch so there is a
 * single classification path — the note page and the profile teasers must never
 * be able to disagree about what a note is tagged.
 */
export async function fetchEventTags(
  eventId: string,
  viewerPubkey?: string,
  observer: TrustObserver = "house",
  /** The event's coordinate, when it is addressable (#334). */
  address?: string,
): Promise<NoteTagsResult> {
  const batch = await fetchEventTagsBatch([eventId], viewerPubkey, observer, address ? { [eventId]: address } : {});
  return batch.get(eventId) ?? EMPTY_NOTE_TAGS;
}

/** A note carrying a tag, as the tag page lists it. */
export interface TaggedNote {
  /** The note's event id. Addressable targets carry `address` instead. */
  id?: string;
  address?: string;
  applications: number;
  disputes: number;
  asserters: string[];
  myStance?: "apply" | "dispute";
  /** Newest applying assertion, for a "recently tagged" ordering. */
  addedAt: number;
  /**
   * Relay hints the asserters attached to their `e` tag — where the note
   * actually lives. The hub carries assertions ABOUT notes, never the notes, so
   * without a hint a reader can only guess (their own relays) and a note living
   * elsewhere is unreachable. Our own writes always attach one; the reference
   * publisher currently attaches none, so this is often empty.
   */
  relays: string[];
}

/**
 * Every note the network says carries one tag — the event half of C6, and what
 * Floor D wants listed on a tag page beside the people.
 *
 * Two hops, because a tag can have several legitimate headers authored by
 * different people: find the tag's headers first, then read every tagging that
 * points at any of them.
 */
export async function fetchTagNotes(
  authorPubkey: string,
  slug: string,
  viewerPubkey?: string,
  observer: TrustObserver = "house",
): Promise<TaggedNote[]> {
  let headers: NostrEvent[] = [];
  try {
    const perAuthority = await Promise.all(
      Z_HANDLE_PUBKEYS.map((ta) =>
        fetchTagEvents(
          filterTaggingHeadersForTag({
            tagAuthorPubkey: authorPubkey,
            slug,
            taPubkey: ta,
          }) as Record<string, unknown>,
        ).catch(() => [] as NostrEvent[]),
      ),
    );
    const byId = new Map<string, NostrEvent>();
    for (const ev of perAuthority.flat()) byId.set(ev.id, ev);
    headers = Array.from(byId.values());
  } catch {
    return [];
  }
  // No header means nobody has ever made this tag applicable to notes, so there
  // is nothing to find. Not an error — most tags are people-only today.
  if (!headers.length) return [];

  // One per coordinate, the newest: a relay can send a header beside the version it replaced.
  headers = [...new Set(headers.map(holdHeader))];

  let candidates: NostrEvent[] = [];
  try {
    // One query across every header coordinate rather than one per header.
    candidates = await fetchAllTagEvents({
      kinds: [TAG_ELEMENT_KIND],
      "#z": headers.map(headerCoordOf),
    });
  } catch {
    return [];
  }
  if (!candidates.length) return [];

  const deduped = latestByReplaceableKey(candidates);
  const trust = await resolveTrust(Array.from(new Set(deduped.map((ev) => ev.pubkey))), observer);
  const grouped = groupTaggingsByTarget({
    candidates: deduped,
    headers,
    honoredAuthorities: Z_HANDLE_PUBKEYS,
    isAsserterTrusted: trust.predicate,
    viewerPubkey,
    tag: { authorPubkey, slug },
  });

  const mineFor = new Map(
    grouped.mine.map((m) => [m.target.id ?? m.target.address ?? "", m.stance as "apply" | "dispute"]),
  );

  // Harvest the `e`-tag relay hints before we lose the raw candidates — the
  // classifier returns targets, not the tags they came from.
  const hintsFor = new Map<string, Set<string>>();
  for (const ev of deduped) {
    const e = (ev.tags || []).find((t) => t[0] === "e");
    const hint = e?.[2];
    if (!e?.[1] || typeof hint !== "string" || !/^wss?:\/\//i.test(hint)) continue;
    if (!hintsFor.has(e[1])) hintsFor.set(e[1], new Set());
    hintsFor.get(e[1])!.add(hint);
  }

  // The viewer's own tagging when the trust filter doesn't count them (a new or
  // unscored account): the classifier keeps it in `mine` and out of `targets`,
  // so it has to be put back or the post they just tagged is on the post's page
  // ("Tagged as") and missing from the tag's. Theirs alone: nobody else's read
  // has a `mine` for it, and it adds nothing to the count.
  const countedKeys = new Set(grouped.targets.map((t) => t.target.id ?? t.target.address ?? ""));
  const mineOnly = grouped.mine
    .filter((m) => m.stance === "apply" && !countedKeys.has(m.target.id ?? m.target.address ?? ""))
    .map((m) => ({ target: m.target, applications: [], disputes: [], mineAt: m.createdAt }));

  return [...grouped.targets.map((t) => ({ ...t, mineAt: 0 })), ...mineOnly]
    .map((t) => {
      const applied = new Set(t.applications.map((a) => a.authorPubkey));
      const disputed = new Set(t.disputes.map((d) => d.authorPubkey));
      return {
        id: t.target.id,
        address: t.target.address,
        applications: applied.size,
        disputes: disputed.size,
        asserters: Array.from(applied),
        myStance: mineFor.get(t.target.id ?? t.target.address ?? ""),
        addedAt: t.applications.reduce((max, a) => Math.max(max, a.createdAt ?? 0), t.mineAt),
        relays: Array.from(hintsFor.get(t.target.id ?? "") ?? []),
      };
    })
    .filter((n) => netPositive(n.applications, n.disputes) || !!n.myStance)
    .sort((a, b) => b.applications - a.applications || b.addedAt - a.addedAt);
}

/**
 * Apply (or dispute) a tag on a note as the signed-in user.
 *
 * 1, 2 or 3 publishes depending on what already exists — the SDK decides and
 * signs everything before publishing anything, so cancelling the signer aborts
 * cleanly with nothing on the relays. A partial failure is reported in
 * `failedAt` and must be surfaced rather than reported as success.
 *
 * `relayHint` rides along on the `e` tag so a reader can fetch the target note
 * from where it actually lives, instead of us persisting other people's notes
 * onto the tag hub.
 */
export async function applyTagToEvent({
  tag,
  target,
  relayHint,
  polarity = 1,
}: {
  tag: { authorPubkey: string; slug: string } | { name: string; description?: string };
  /** What the tagging names (`tagTargetOf`): a note by id, an addressable event by coordinate (#334). */
  target: TagTarget;
  relayHint?: string;
  polarity?: Polarity;
}) {
  const user = activeAccount();
  if (!user?.pubkey) throw new Error("Sign in to tag.");

  const result = await applyEventTagging({
    tagInput: tag,
    target: { ...target, ...(relayHint ? { relays: [relayHint] } : {}) },
    polarity,
    asserterPubkey: user.pubkey,
    taPubkeys: Z_HANDLE_PUBKEYS,
    deps: {
      // Which tagging headers already exist for this tag — decides whether the
      // asserter has to mint one (sequence b) or can reference an existing one
      // (sequence a).
      findHeaders: async ({ tagAuthorPubkey, slug }) => {
        const found = await Promise.all(
          Z_HANDLE_PUBKEYS.map((ta) =>
            fetchTagEvents(
              filterTaggingHeadersForTag({ tagAuthorPubkey, slug, taPubkey: ta }) as Record<string, unknown>,
            ).catch(() => [] as NostrEvent[]),
          ),
        );
        const byAuthor = new Map<string, { author: string }>();
        for (const ev of found.flat()) {
          holdHeader(ev);
          byAuthor.set(ev.pubkey, { author: ev.pubkey });
        }
        return Array.from(byAuthor.values());
      },
      sign: (template: unknown) => signAs(requireActiveAccount(), template as never),
      publish: publishTagEvent,
      now: () => Math.floor(Date.now() / 1000),
      hash8,
    },
  });
  // Read back from the relays: whether it is there, not only whether one said OK.
  return readBack(result);
}

/**
 * The first 8 lowercase hex of the SHA-256 of `s`'s UTF-8 bytes. An addressable target's tagging
 * `d` carries it of the full coordinate, so one asserter's taggings of two items by the same author
 * land at two addresses instead of one replacing the other (lib/tagging-sdk, Tapestry 2417b807).
 */
export async function hash8(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest).slice(0, 4), (b) => b.toString(16).padStart(2, "0")).join("");
}
