/**
 * Trusted Lists (kinds 30392–30395), read from their tags. A Trusted List is
 * the list analog of a NIP-85 Trusted Assertion, by the `+10` rule: the last
 * digit of the kind says what its members are, exactly as 3038x's says what an
 * assertion is about (Tapestry's pre-NIP "Trusted Lists" draft,
 * nous-clawds4/tapestry protocols/drafts/trusted-lists.md; Quartz's
 * experimental/trustedLists reads the same wire).
 *
 *   30392  pubkeys                        member tag `p`
 *   30393  events, by id                  member tag `e`
 *   30394  addressable events, by address member tag `a` (`kind:pubkey:d`)
 *   30395  external identifiers (NIP-73)  member tag `i`
 *
 *   ["title", …] ["description", …] ["metric", "tag-membership"]
 *   ["observer", <whose perspective>]
 *   ["source-tag", <tag id>, <tag author>, <slug>]
 *   ["cutoff", …] ["min-rank", …] ["rigor", …]
 *   [<member tag>, <value>, <hint>, <score 0–100>] …
 *   ["truncated", <true total>]   — present: the list is not exhaustive
 *   ["status", "retracted"]       — no longer maintained at this `d`
 *
 * What the draft says, and this reader keeps to:
 * - Only the kind's member tag is a member. A single-letter tag of another
 *   letter is discovery metadata, not a member: the pinned-tag note list
 *   (30393) carries `["a", "39999:<tag author>:<slug>"]` and `["p", <observer>]`
 *   so relays can find it, and neither is on the list.
 * - Index 2 is a hint, index 3 the score, on every member tag alike. On `e`
 *   index 3 is the score, never a NIP-10 marker. The hint counts as a relay
 *   only when it is a ws(s):// url (a petname in that slot is not a relay); on
 *   `i` it is NIP-73's url hint.
 * - The score is an integer 0–100. A value off that scale is dropped, not
 *   clamped (Quartz's MemberTagFields.score): the member stands, unscored.
 * - `content` is an optional JSON echo of the members. Nothing here reads it.
 *
 * `tagging-target` (what a 30393/30394 lists: a kind number, or a Dictionary
 * list's header) is brainstorm_server's own tag (its ADR trusted-lists/0002),
 * not the draft's; it is read as that ADR documents it (services/tagLists).
 */
export const TRUSTED_PEOPLE_KIND = 30392;
export const TRUSTED_EVENTS_KIND = 30393;
export const TRUSTED_ADDRESSES_KIND = 30394;
export const TRUSTED_IDENTIFIERS_KIND = 30395;

export const TRUSTED_LIST_KINDS: ReadonlySet<number> = new Set([
  TRUSTED_PEOPLE_KIND,
  TRUSTED_EVENTS_KIND,
  TRUSTED_ADDRESSES_KIND,
  TRUSTED_IDENTIFIERS_KIND,
]);

/** The lists whose members are things, not people: drawn as a list of things (lib/listItems). */
export const TRUSTED_ITEM_LIST_KINDS: ReadonlySet<number> = new Set([
  TRUSTED_EVENTS_KIND,
  TRUSTED_ADDRESSES_KIND,
  TRUSTED_IDENTIFIERS_KIND,
]);

/** The member tag each kind's members ride in. */
export const TRUSTED_MEMBER_TAG: Readonly<Record<number, "p" | "e" | "a" | "i">> = {
  [TRUSTED_PEOPLE_KIND]: "p",
  [TRUSTED_EVENTS_KIND]: "e",
  [TRUSTED_ADDRESSES_KIND]: "a",
  [TRUSTED_IDENTIFIERS_KIND]: "i",
};

export interface TrustedMember {
  /** A pubkey, an event id, an address `kind:pubkey:d`, or a NIP-73 id — what the kind says. */
  value: string;
  /** Index 2: a relay url (p/e/a), or NIP-73's url hint (i). Absent when the slot holds neither. */
  hint?: string;
  /** Index 3: 0–100, null when absent or off the scale. */
  score: number | null;
}

export interface TrustedList {
  kind: number;
  title: string;
  description?: string;
  metric?: string;
  /** Whose web of trust ranked the members. */
  perspective?: string;
  /** The tag the list was built from: its author and slug. */
  sourceTag?: { authorPubkey: string; slug: string };
  /** brainstorm_server's `tagging-target` (30393/30394): a kind number, or a Dictionary list's header. */
  taggingTarget?: string;
  /** The build's parameters, as published: [name, value]. */
  params: Array<[string, string]>;
  /** Every member, best first, whatever the kind; members with no score last. */
  entries: TrustedMember[];
  /** The people of a 30392, best first — `entries` as pubkeys. Empty on the other kinds. */
  members: Array<{ pubkey: string; score: number | null }>;
  /** `["truncated", <total>]`: the list is not exhaustive. The total, when it parses. */
  truncated: { total: number | null } | null;
  /** `["status", "retracted"]`: no longer maintained at this address. */
  retracted: boolean;
}

const HEX64 = /^[0-9a-f]{64}$/i;
const PARAM_TAGS: Array<[tag: string, label: string]> = [
  ["min-rank", "Min rank"],
  ["cutoff", "Cutoff"],
  ["rigor", "Rigor"],
];

const tagOf = (tags: string[][], name: string) => tags.find((t) => t[0] === name);

/** The score slot, on the 0–100 integer scale or not at all. */
function scoreOf(raw: string | undefined): number | null {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= 0 && n <= 100 ? n : null;
}

/** A member's value, in the shape its kind names; null when it is not one. */
function memberValue(kind: number, raw: string | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  if (kind === TRUSTED_PEOPLE_KIND || kind === TRUSTED_EVENTS_KIND) return HEX64.test(v) ? v.toLowerCase() : null;
  if (kind === TRUSTED_ADDRESSES_KIND) {
    const [k, pk, ...rest] = v.split(":");
    return /^\d+$/.test(k ?? "") && HEX64.test(pk ?? "") && rest.length > 0 ? v : null;
  }
  return v;
}

function hintOf(kind: number, raw: string | undefined): string | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  if (kind === TRUSTED_IDENTIFIERS_KIND) return v;
  return /^wss?:\/\/\S{3,}/i.test(v) ? v : undefined;
}

/** The list's kind; a 30392 when the caller passed only tags (the people list is the family's first). */
export function readTrustedList(event: { kind?: number; tags: string[][] }): TrustedList {
  const { tags } = event;
  const kind = event.kind !== undefined && TRUSTED_LIST_KINDS.has(event.kind) ? event.kind : TRUSTED_PEOPLE_KIND;
  const memberTag = TRUSTED_MEMBER_TAG[kind];
  const source = tagOf(tags, "source-tag");
  const perspective = tagOf(tags, "observer")?.[1];
  const retracted = tags.some((t) => t[0] === "status" && t[1] === "retracted");
  const seen = new Set<string>();
  const entries: TrustedMember[] = [];
  for (const t of tags) {
    if (t[0] !== memberTag) continue;
    const value = memberValue(kind, t[1]);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    const hint = hintOf(kind, t[2]);
    entries.push({ value, ...(hint ? { hint } : {}), score: scoreOf(t[3]) });
  }
  // Published best first; sort anyway (stable, so ties keep their order).
  entries.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
  const truncatedTag = tagOf(tags, "truncated");
  const total = truncatedTag?.[1] && /^\d+$/.test(truncatedTag[1]) ? Number(truncatedTag[1]) : null;
  return {
    kind,
    title: tagOf(tags, "title")?.[1] || tagOf(tags, "name")?.[1] || "Trusted list",
    description: tagOf(tags, "description")?.[1] || undefined,
    metric: tagOf(tags, "metric")?.[1] || undefined,
    perspective: perspective && HEX64.test(perspective) ? perspective : undefined,
    sourceTag:
      source?.[2] && HEX64.test(source[2]) && source[3] ? { authorPubkey: source[2], slug: source[3] } : undefined,
    taggingTarget:
      kind === TRUSTED_EVENTS_KIND || kind === TRUSTED_ADDRESSES_KIND
        ? tagOf(tags, "tagging-target")?.[1]?.trim() || undefined
        : undefined,
    params: PARAM_TAGS.flatMap(([tag, label]) => {
      const v = tagOf(tags, tag)?.[1];
      return v ? [[label, v] as [string, string]] : [];
    }),
    entries,
    members: kind === TRUSTED_PEOPLE_KIND ? entries.map((m) => ({ pubkey: m.value, score: m.score })) : [],
    truncated: truncatedTag ? { total } : null,
    retracted,
  };
}

/** What a list's members are, as a noun: "person", "note", "item", "identifier". */
export function trustedMemberNoun(kind: number, n: number): string {
  const one =
    kind === TRUSTED_PEOPLE_KIND
      ? n === 1
        ? "person"
        : "people"
      : kind === TRUSTED_EVENTS_KIND
        ? "event"
        : kind === TRUSTED_ADDRESSES_KIND
          ? "item"
          : "identifier";
  return kind === TRUSTED_PEOPLE_KIND || n === 1 ? one : `${one}s`;
}
