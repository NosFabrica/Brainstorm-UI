/**
 * The events that record something someone did — a zap, a reaction, a report,
 * a vote, an award, a trust score — read into their parts: who did it, to
 * whom, how much, and the event it is about. The All tab's row says it in a
 * line (lib/resultReaders); the event page draws it (components/share/activity).
 * Both read through here, so a row and its page agree.
 *
 * Parsing only: nothing here draws, asks a relay or names a person in words.
 */
import { reactionEmoji, type CustomEmoji } from "@/lib/customEmoji";
import { tagValue } from "@/lib/tagValue";
import { isVerifiedEvent, readZapRequest } from "@/lib/zapRequest";
import { parseZapReceipt } from "@/services/search";

export type ActivityEvent = {
  id: string;
  pubkey: string;
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
};

/** The event an activity is about: by id, or by address. */
export interface EventRef {
  id?: string;
  addr?: string;
  relay?: string;
}

const HEX64 = /^[0-9a-f]{64}$/i;
const ADDRESS = /^\d+:[0-9a-f]{64}:/i;

const tagsOf = (ev: { tags: string[][] }, name: string) =>
  ev.tags.filter((t) => t[0] === name && typeof t[1] === "string");
const unique = <T>(values: (T | null | undefined)[]) =>
  Array.from(new Set(values.filter((v): v is T => v !== null && v !== undefined && v !== "")));
const hexKey = (v: string | null | undefined) => (v && HEX64.test(v) ? v.toLowerCase() : null);
/** A relay hint, when the tag's third value is one (some clients put a marker there). */
const relayOf = (t: string[]) => (t[2] && /^wss?:\/\//i.test(t[2]) ? t[2] : undefined);

/** An address with its key lower-cased: `30023:<PK>:d` names the same event as `30023:<pk>:d`. */
const normalAddr = (addr: string) => {
  const [kind, pubkey, ...d] = addr.split(":");
  return [kind, pubkey.toLowerCase(), ...d].join(":");
};
/** The key of an address: its issuer, its owner. */
const addrPubkey = (addr: string | null | undefined) =>
  addr && ADDRESS.test(addr) ? addr.split(":")[1].toLowerCase() : null;

const refOfTag = (t: string[] | null | undefined): EventRef | null => {
  if (!t) return null;
  if (t[0] === "e" && HEX64.test(t[1])) return { id: t[1].toLowerCase(), relay: relayOf(t) };
  if (t[0] === "a" && ADDRESS.test(t[1])) return { addr: normalAddr(t[1]), relay: relayOf(t) };
  return null;
};

/**
 * The `e` (else the `a`) an event points at. NIP-25 and NIP-57 name the target
 * last; lists and deletions name theirs first.
 */
export function targetOf(ev: { tags: string[][] }, prefer: "first" | "last" = "last"): EventRef | null {
  const pick = (name: string) => (prefer === "last" ? tagsOf(ev, name).at(-1) : tagsOf(ev, name)[0]);
  return refOfTag(pick("e")) ?? refOfTag(pick("a"));
}

/** Every event and address an event names, in order, each once. */
export function targetsOf(ev: { tags: string[][] }): EventRef[] {
  const seen = new Set<string>();
  const out: EventRef[] = [];
  for (const t of ev.tags) {
    const ref = refOfTag(t);
    const key = ref?.id ?? ref?.addr;
    if (ref && key && !seen.has(key)) {
      seen.add(key);
      out.push(ref);
    }
  }
  return out;
}

/** An address's kind: `30009:<pk>:<d>` → 30009. */
export const addressKind = (addr: string): number => Number(addr.split(":")[0]);

// ---- Zaps: NIP-57 (9734 request, 9735 receipt), NIP-61 (9321), NIP-B1 (9736), NIP-BC (8333) ----

export type ZapRail = "lightning" | "request" | "cashu" | "bolt12" | "onchain";

export interface Zap {
  rail: ZapRail;
  /** Who paid. Null when the zap is anonymous, or its payer cannot be read. */
  payer: string | null;
  /**
   * The payer is only what the event says, with no signature of theirs behind
   * it: a receipt (signed by a wallet service) whose embedded request does not
   * verify against it. Anyone can write such a receipt naming anyone.
   */
  payerClaimed: boolean;
  recipient: string | null;
  /** In sats, or in `unit` when a mint counts in something else. Null when unknown. */
  amount: number | null;
  /** "sats", or a mint's own unit ("usd"). */
  unit: string;
  comment: string;
  /** The tags the comment's NIP-30 emoji are read from: a receipt's own, and its request's. */
  commentTags: string[][];
  /** The zapped event or address; null for a zap to the person. */
  target: EventRef | null;
  /** A nutzap's mint. */
  mint: string | null;
  /** An onchain zap's transaction. */
  txid: string | null;
  block: { hash: string; height: number | null } | null;
}

export const ZAP_KINDS: ReadonlySet<number> = new Set([9734, 9735, 9321, 9736, 8333]);

const positive = (n: number) => (Number.isFinite(n) && n > 0 ? n : null);
const msatsTag = (ev: ActivityEvent) => positive(Number(tagValue(ev, "amount")));

/** A nutzap's amount: the sum of its Cashu proofs. */
function proofTotal(ev: ActivityEvent): number | null {
  let total = 0;
  for (const t of tagsOf(ev, "proof")) {
    try {
      const amount = Number((JSON.parse(t[1]) as { amount?: unknown }).amount);
      if (Number.isFinite(amount)) total += amount;
    } catch {
      /* a proof we cannot read counts nothing */
    }
  }
  return total > 0 ? total : null;
}

export function readZap(ev: ActivityEvent): Zap | null {
  if (!ZAP_KINDS.has(ev.kind)) return null;
  const recipient = hexKey(tagValue(ev, "p"));
  const base = {
    recipient,
    comment: ev.content.trim(),
    commentTags: ev.tags,
    payerClaimed: false,
    mint: null,
    txid: null,
    block: null,
    unit: "sats",
  };
  switch (ev.kind) {
    case 9735: {
      // A receipt is signed by the recipient's wallet service: the payer is in
      // the request it carries, and is theirs only if that request verifies.
      const receipt = parseZapReceipt(ev as Parameters<typeof parseZapReceipt>[0]);
      const request = readZapRequest(ev);
      const payer = request?.anonymous ? null : receipt.pubkey;
      return {
        ...base,
        rail: "lightning",
        payer,
        payerClaimed: !!payer && !request?.verified,
        amount: receipt.msats ? receipt.msats / 1000 : null,
        comment: receipt.memo,
        commentTags: [...ev.tags, ...(request?.tags.filter((t) => t[0] === "emoji") ?? [])],
        target: targetOf(ev),
      };
    }
    case 9734: {
      const msats = msatsTag(ev);
      // An anonymous request is signed by a throwaway key: it names nobody.
      const anonymous = ev.tags.some((t) => t[0] === "anon");
      return {
        ...base,
        rail: "request",
        payer: anonymous ? null : ev.pubkey,
        amount: msats ? msats / 1000 : null,
        target: targetOf(ev),
      };
    }
    case 9321: {
      const unit = (tagValue(ev, "unit") ?? "sat").toLowerCase();
      const total = proofTotal(ev);
      return {
        ...base,
        rail: "cashu",
        payer: ev.pubkey,
        amount: total && unit === "msat" ? total / 1000 : total,
        unit: unit === "sat" || unit === "msat" ? "sats" : unit,
        mint: tagValue(ev, "u"),
        target: targetOf(ev),
      };
    }
    case 9736: {
      // Signed by the payer when attributed (`P`), by a throwaway key when anonymous.
      const msats = msatsTag(ev);
      return {
        ...base,
        rail: "bolt12",
        payer: hexKey(tagValue(ev, "P")),
        amount: msats ? msats / 1000 : null,
        target: targetOf(ev, "first"),
      };
    }
    default: {
      // 8333: the payer signs; the amount is in sats, claimed until the chain says so.
      const i = tagsOf(ev, "i").find((t) => /^bitcoin:tx:[0-9a-f]{64}$/i.test(t[1]));
      const block = tagsOf(ev, "block")[0];
      return {
        ...base,
        rail: "onchain",
        payer: ev.pubkey,
        amount: positive(Number(tagValue(ev, "amount"))),
        txid: i ? i[1].slice("bitcoin:tx:".length).toLowerCase() : null,
        block:
          block && HEX64.test(block[1])
            ? { hash: block[1].toLowerCase(), height: Number.isFinite(Number(block[2])) ? Number(block[2]) : null }
            : null,
        target: targetOf(ev, "first"),
      };
    }
  }
}

/** "2,100 sats", "5 usd" — or null when the zap names no amount. */
export function zapAmount(zap: Pick<Zap, "amount" | "unit">): string | null {
  if (zap.amount === null) return null;
  const n = zap.unit === "sats" ? Math.round(zap.amount) : zap.amount;
  return `${n.toLocaleString()} ${n === 1 && zap.unit === "sats" ? "sat" : zap.unit}`;
}

// ---- Reactions: NIP-25 (7), and NIP-25 external content (17) by NIP-73 `i` ----

export type ReactionMark =
  { type: "like" } | { type: "dislike" } | { type: "custom"; emoji: CustomEmoji } | { type: "text"; text: string };

/** A reaction's content, as the mark it is: "+" a like, "-" a dislike, a NIP-30 picture, or the emoji itself. */
export function reactionMarkOf(ev: { content: string; tags: string[][] }): ReactionMark {
  const custom = reactionEmoji(ev);
  if (custom) return { type: "custom", emoji: custom };
  const c = ev.content.trim();
  if (!c || c === "+") return { type: "like" };
  if (c === "-") return { type: "dislike" };
  return { type: "text", text: c };
}

/** A NIP-73 external target: a web page, a hashtag, a book, a podcast episode, a place. */
export interface ExternalTarget {
  id: string;
  /** The page itself, when the id is a web address. */
  url: string | null;
  /** The `k` beside it — "web", "#", "isbn", "podcast:item:guid". */
  kind: string | null;
  /** The id as a reader reads it: a web address without its scheme. */
  label: string;
}

const WEB = /^https?:\/\//i;
const webLabel = (url: string) => url.replace(/^https?:\/\/(?:www\.)?/i, "").replace(/\/+$/, "");

export function externalTargetOf(ev: { tags: string[][] }): ExternalTarget | null {
  const id = tagValue(ev, "i");
  if (!id) return null;
  const url = WEB.test(id) ? id : null;
  return { id, url, kind: tagValue(ev, "k"), label: url ? webLabel(url) : id };
}

/** A kind-17 reaction from before NIP-73 names its web page in `r`: only a web page, never another scheme. */
function webTargetOfR(ev: { tags: string[][] }): ExternalTarget | null {
  const url = tagsOf(ev, "r").find((t) => WEB.test(t[1]))?.[1];
  return url ? { id: url, url, kind: tagValue(ev, "k") ?? "web", label: webLabel(url) } : null;
}

export interface Reaction {
  mark: ReactionMark;
  /** The author of what was reacted to. */
  to: string | null;
  target: EventRef | null;
  /** The reacted-to event's kind (`k`), when the reaction says. */
  targetKind: number | null;
  external: ExternalTarget | null;
}

export function readReaction(ev: ActivityEvent): Reaction {
  const k = tagValue(ev, "k");
  return {
    mark: reactionMarkOf(ev),
    to: hexKey(tagsOf(ev, "p").at(-1)?.[1]),
    target: targetOf(ev),
    targetKind: k && /^\d+$/.test(k) ? Number(k) : null,
    external: ev.kind === 17 ? (externalTargetOf(ev) ?? webTargetOfR(ev)) : null,
  };
}

// ---- Deletion (NIP-09, 5) ----

export interface Deletion {
  targets: EventRef[];
  kinds: number[];
  reason: string;
}

export function readDeletion(ev: ActivityEvent): Deletion {
  return {
    targets: targetsOf(ev),
    kinds: unique(tagsOf(ev, "k").map((t) => (/^\d+$/.test(t[1]) ? Number(t[1]) : null))),
    reason: ev.content.trim(),
  };
}

// ---- Badge award (NIP-58, 8) ----

export interface BadgeAward {
  /** The badge definition's address, `30009:<issuer>:<d>`. */
  badge: string | null;
  relay?: string;
  awardees: string[];
  /**
   * Signed by the badge's issuer (NIP-58: only they award it). Anyone else
   * naming the badge only claims it.
   */
  byIssuer: boolean;
}

export function readBadgeAward(ev: ActivityEvent): BadgeAward {
  const a = tagsOf(ev, "a").find((t) => ADDRESS.test(t[1]));
  const badge = a ? normalAddr(a[1]) : null;
  return {
    badge,
    relay: a ? relayOf(a) : undefined,
    awardees: unique(tagsOf(ev, "p").map((t) => hexKey(t[1]))),
    byIssuer: !!badge && addrPubkey(badge) === ev.pubkey.toLowerCase(),
  };
}

// ---- Report (NIP-56, 1984) ----

export const REPORT_TYPES = ["nudity", "malware", "profanity", "illegal", "spam", "impersonation", "other"];

export interface Report {
  /** Who is reported — or, beside an event, whose event it is. */
  person: string | null;
  event: EventRef | null;
  /** The NIP-56 type, on the `e` tag for an event and the `p` tag for a person. */
  reason: string | null;
  comment: string;
}

export function readReport(ev: ActivityEvent): Report {
  const p = tagsOf(ev, "p")[0];
  const e = tagsOf(ev, "e")[0];
  // The type is the tag's third value; a relay there is a hint, not a reason.
  const typeOf = (t?: string[]) => (t?.[2] && !/^wss?:\/\//i.test(t[2]) ? t[2].trim().toLowerCase() : null);
  return {
    person: hexKey(p?.[1]),
    event: refOfTag(e),
    reason: typeOf(e) ?? typeOf(p),
    comment: ev.content.trim(),
  };
}

// ---- Label (NIP-32, 1985) ----

export interface Label {
  namespaces: string[];
  labels: { value: string; namespace: string | null }[];
  people: string[];
  events: EventRef[];
  /** `r`: relays or web pages labelled. */
  links: string[];
  hashtags: string[];
  comment: string;
}

export function readLabel(ev: ActivityEvent): Label {
  // One value in two namespaces is two labels ("funny" in ugc, "funny" in a moderation vocabulary).
  const seen = new Set<string>();
  const labels: Label["labels"] = [];
  for (const t of tagsOf(ev, "l")) {
    const label = { value: t[1], namespace: t[2] || null };
    const key = JSON.stringify([label.value, label.namespace]);
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  return {
    namespaces: unique(tagsOf(ev, "L").map((t) => t[1])),
    labels,
    people: unique(tagsOf(ev, "p").map((t) => hexKey(t[1]))),
    events: targetsOf(ev),
    links: unique(tagsOf(ev, "r").map((t) => t[1])),
    hashtags: unique(tagsOf(ev, "t").map((t) => t[1].replace(/^#/, ""))),
    comment: ev.content.trim(),
  };
}

// ---- Community post approval (NIP-72, 4550) ----

export interface Approval {
  /** The community's address, `34550:<owner>:<d>`. */
  community: string | null;
  post: EventRef | null;
  /**
   * The approved post as the approval carries it (NIP-72 puts its JSON in the
   * content) — only when it is signed by its author and is the post the
   * approval names. Otherwise null, and the post is asked for by its `e`.
   */
  embedded: ActivityEvent | null;
}

const coordOfEvent = (e: ActivityEvent) => `${e.kind}:${e.pubkey}:${tagValue(e, "d") ?? ""}`;

export function readApproval(ev: ActivityEvent): Approval {
  const community = tagsOf(ev, "a").find((t) => t[1].startsWith("34550:") && ADDRESS.test(t[1]));
  const postAddr = tagsOf(ev, "a").find((t) => !t[1].startsWith("34550:") && ADDRESS.test(t[1]));
  const post = refOfTag(tagsOf(ev, "e")[0]) ?? refOfTag(postAddr);
  let embedded: ActivityEvent | null = null;
  try {
    const parsed: unknown = JSON.parse(ev.content);
    // Anyone can write any JSON here: a post is shown as its author's only under their signature.
    if (post && isVerifiedEvent(parsed) && (post.id ? parsed.id === post.id : coordOfEvent(parsed) === post.addr))
      embedded = parsed;
  } catch {
    /* an approval that does not carry its post still names it */
  }
  return { community: community ? normalAddr(community[1]) : null, post, embedded };
}

/**
 * Whose word an approval is (NIP-72): the community's owner, one of the
 * moderators its definition names, or nobody's in particular — anyone can
 * sign a 4550. The owner is in the address; moderators need the definition,
 * and one by anyone else than the owner is not the community's.
 */
export function approvalAuthority(
  approval: Pick<Approval, "community">,
  signer: string,
  definition: { pubkey: string; tags: string[][] } | null | undefined,
): "owner" | "moderator" | null {
  const owner = addrPubkey(approval.community);
  const who = signer.toLowerCase();
  if (!owner) return null;
  if (who === owner) return "owner";
  if (
    definition &&
    definition.pubkey.toLowerCase() === owner &&
    tagsOf(definition, "p").some((t) => t[1].toLowerCase() === who && t[3] === "moderator")
  )
    return "moderator";
  return null;
}

// ---- Poll vote (NIP-88, 1018) ----

export interface PollVote {
  poll: EventRef | null;
  /** The chosen options' ids, as the poll names them in its `option` tags. */
  responses: string[];
}

export function readPollVote(ev: ActivityEvent): PollVote {
  return { poll: targetOf(ev, "first"), responses: unique(tagsOf(ev, "response").map((t) => t[1])) };
}

/** A vote's choices in the poll's own words, once the poll is in hand; the ids until then. */
export function pollChoices(responses: string[], poll: { tags: string[][] } | null | undefined): string[] {
  const options = new Map((poll ? tagsOf(poll, "option") : []).map((t) => [t[1], t[2]?.trim() || t[1]]));
  return responses.map((r) => options.get(r) ?? r);
}

// ---- Calendar RSVP (NIP-52, 31925) ----

export type RsvpStatus = "accepted" | "declined" | "tentative";

export interface Rsvp {
  status: RsvpStatus | null;
  /** "Going", "Not going", "Maybe going" — or "Replied" for a status nobody defined. */
  word: string;
  freeBusy: "free" | "busy" | null;
  /** The appointment's address, `31922|31923:<pk>:<d>`. */
  appointment: string | null;
  relay?: string;
  /** The appointment's version by id, when the RSVP names one. */
  eventId: string | null;
  note: string;
}

const RSVP_WORDS: Record<RsvpStatus, string> = { accepted: "Going", declined: "Not going", tentative: "Maybe going" };

export function readRsvp(ev: ActivityEvent): Rsvp {
  const raw = (tagValue(ev, "status") ?? "").toLowerCase();
  // Own keys only: `__proto__` or `constructor` is no status.
  const status = Object.hasOwn(RSVP_WORDS, raw) ? (raw as RsvpStatus) : null;
  const fb = (tagValue(ev, "fb") ?? "").toLowerCase();
  const a = tagsOf(ev, "a").find((t) => ADDRESS.test(t[1]));
  return {
    status,
    word: status ? RSVP_WORDS[status] : "Replied",
    // NIP-52: free/busy is only said beside a reply that is not a "no".
    freeBusy: status !== "declined" && (fb === "free" || fb === "busy") ? fb : null,
    appointment: a?.[1] ?? null,
    relay: a ? relayOf(a) : undefined,
    eventId: hexKey(tagValue(ev, "e")),
    note: ev.content.trim(),
  };
}

// ---- Follow list (NIP-02, 3) ----

export interface Follows {
  people: string[];
  hashtags: string[];
}

export function readFollows(ev: ActivityEvent): Follows {
  return {
    people: unique(tagsOf(ev, "p").map((t) => hexKey(t[1]))),
    hashtags: unique(tagsOf(ev, "t").map((t) => t[1].replace(/^#/, "").trim())),
  };
}

// ---- Trusted assertions (NIP-85, 30382–30385; NosFabrica/protocols trusted-assertions.md) ----

export const ASSERTION_KINDS: ReadonlySet<number> = new Set([30382, 30383, 30384, 30385]);

export interface Metric {
  tag: string;
  value: number;
}

/** The numbers an assertion carries, in its own order: `rank`, `followers`, `zap_cnt`… */
export function assertionMetrics(ev: { tags: string[][] }): Metric[] {
  const out: Metric[] = [];
  for (const t of ev.tags) {
    if (["d", "p", "e", "a", "k", "client", "alt"].includes(t[0]) || typeof t[1] !== "string" || t[1] === "") continue;
    const value = Number(t[1]);
    if (Number.isFinite(value) && !out.some((m) => m.tag === t[0])) out.push({ tag: t[0], value });
  }
  return out;
}

export interface Assertion {
  /** 30382: the person scored. */
  pubkey: string | null;
  /** 30383/30384: the event or address scored. */
  ref: EventRef | null;
  /** 30385: the NIP-73 identifier scored. */
  identifier: string | null;
  /** 0–100: round(influence × 100), from one observer's point of view. */
  rank: number | null;
  /**
   * Follow hops from the observer. Absent means no known path — never 0, which
   * is the observer's own record.
   */
  hops: number | null;
  metrics: Metric[];
}

export function readAssertion(ev: ActivityEvent): Assertion {
  const d = tagValue(ev, "d") ?? "";
  const metrics = assertionMetrics(ev);
  const value = (tag: string) => metrics.find((m) => m.tag === tag)?.value ?? null;
  return {
    pubkey: ev.kind === 30382 ? hexKey(d) : null,
    ref:
      ev.kind === 30383 && HEX64.test(d)
        ? { id: d.toLowerCase() }
        : ev.kind === 30384 && ADDRESS.test(d)
          ? { addr: d }
          : null,
    identifier: ev.kind === 30385 && d ? d : null,
    rank: value("rank"),
    hops: value("hops"),
    metrics,
  };
}

/** A metric's tag as words: `zap_cnt` → "zaps", `personalizedGrapeRank_influence` → "personalized grape rank influence". */
export function metricNoun(tag: string): string {
  return tag
    .replace(/_cnt$/, "s")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
}
