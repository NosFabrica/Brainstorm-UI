import type { NostrEvent } from "applesauce-core/helpers";
import { treasureMapDuties, type Duty } from "@/lib/treasureMap";
import { appliesTo, CATEGORIES, entryOf, type MapCategory } from "@/lib/treasureMapCards";

/**
 * Does this kind-10040 declare `taPubkey` (publishing on `relayUrl`) as the
 * holder's trust provider? Brainstorm publishes rank AND followers assertions,
 * so a declaration only counts when both tags name our TA on our relay — the
 * semantics `isUsingBrainstorm` has always had, extracted so callers that
 * already hold the event (the dashboard's activation check) can ask the
 * question without re-fetching it.
 */
export function declaresTrustProvider(event: NostrEvent, taPubkey: string, relayUrl: string): boolean {
  if (!taPubkey || !relayUrl) return false;
  let rank = false;
  let followers = false;
  for (const tag of event.tags) {
    if (tag[1] !== taPubkey || String(tag[2]) !== String(relayUrl)) continue;
    if (tag[0] === "30382:rank") rank = true;
    if (tag[0] === "30382:followers") followers = true;
  }
  return rank && followers;
}

/**
 * What a kind-10040 says about the user's provider, given their own assistant
 * (`taPubkey`). The bar is the rank pubkey being THEIR assistant; any other rank
 * target — or none known yet — is "other". No declaration is "none". Whether to
 * RECORD it as activated is the stricter `declaresTrustProvider`.
 */
export function trustProviderStatusOf(
  event: Pick<NostrEvent, "tags"> | null | undefined,
  taPubkey: string | null | undefined,
  relayUrl: string,
): "none" | "brainstorm" | "other" {
  if (!event) return "none";
  if (taPubkey && declaresTrustProvider(event as NostrEvent, taPubkey, relayUrl)) return "brainstorm";
  // Who the Map resolves the rank duty to — by its own row or a broader key.
  const holder = holderOf(event.tags, "30382:rank");
  if (!holder) return "none";
  return holder === taPubkey?.toLowerCase() ? "brainstorm" : "other";
}

/**
 * Who publishes the reader's scores today: the Assistant their Map gives the
 * rank duty to, and the relay it names. Null when no rank duty is given — no
 * Map, or a deactivation. The Activate page names this Assistant, so "another
 * provider" never goes nameless.
 */
export function rankProviderOf(
  event: Pick<NostrEvent, "tags"> | null | undefined,
): { pubkey: string; relay: string } | null {
  const duty = dutyOf(event?.tags ?? [], "30382:rank");
  const holder = duty?.assistants[0];
  // The row that gives it: the rank row itself, or the broader key covering it.
  const row = holder ? duty.entries.find((t) => String(t[1]).toLowerCase() === holder) : undefined;
  return row ? { pubkey: row[1], relay: String(row[2] ?? "") } : null;
}

/**
 * The Trusted List kinds Brainstorm's assistant publishes for a user: 30392
 * (pubkeys), 30393 (events), 30394 (addressable events). Other apps find a
 * user's lists through their 10040, one row per kind.
 */
export const LIST_KINDS = ["30392", "30393", "30394"] as const;

/** Who publishes a user's Trusted Lists, and where — from the server's /setup "30392" row. */
export interface ListDesignation {
  key: string;
  relay: string;
}

/** The 10040 rows naming the assistant for every Trusted List kind. */
export function listRows({ key, relay }: ListDesignation): string[][] {
  return LIST_KINDS.map((kind) => [kind, key, relay]);
}

/**
 * The user's 10040 tags with ours set: every row whose label we're setting is
 * replaced, every other tag — another provider's rows included — is kept. The
 * old publish rebuilt the whole 10040 from our two rows and dropped the rest.
 */
export function mergeDesignation(existing: string[][], rows: string[][]): string[][] {
  const ours = new Set(rows.map((r) => r[0]));
  return [...existing.filter((t) => !ours.has(t[0])), ...rows];
}

/** The Duty group (Scores, Lists, Concepts) a row's key falls in, as the Treasure Map reads it; null for a key that isn't a Duty. */
function categoryOfKey(key: string): MapCategory | null {
  const entry = entryOf([key, "0".repeat(64)]);
  return entry ? (CATEGORIES.find((c) => appliesTo(c, entry)) ?? null) : null;
}

const NOBODY = "0".repeat(64);

/**
 * The Assistant a Treasure Map gives this key's Duty to: its Preferred, found
 * the way the Map is read — through the most specific key that reaches it
 * (Treasure Maps § 6), so a Duty given through `*`, a family (`3038x`) or a
 * whole kind is held, not empty. Null when nobody holds it, or the key names
 * no Duty. Lowercase.
 */
export function holderOf(tags: string[][], key: string): string | null {
  return dutyOf(tags, key)?.assistants[0] ?? null;
}

/** This key's Duty as the Map reads it: its own rows, or those of the most specific key covering it. */
function dutyOf(tags: string[][], key: string): Duty | null {
  const asked = entryOf([key, NOBODY]);
  if (!asked) return null;
  return treasureMapDuties({ tags }, [{ key, pubkey: NOBODY }]).find((d) => d.key === asked.norm) ?? null;
}

interface PlanOptions {
  /** This deployment's Assistant. */
  self: string;
  /** The Duty groups the person chose to move here. */
  take?: readonly MapCategory[];
}

/**
 * The rows of `rows` that may be set on this Map: those whose Duty nobody
 * holds, or `self` already does — or whose Duty group is in `take`. What the
 * lists pill offers and what a publish writes both ask this, so they agree.
 */
export function fillableRows(existing: string[][], rows: string[][], { self, take = [] }: PlanOptions): string[][] {
  const me = self.toLowerCase();
  return rows.filter((r) => {
    const holder = holderOf(existing, r[0]);
    if (holder === null || holder === me) return true;
    const category = categoryOfKey(r[0]);
    return category !== null && take.includes(category);
  });
}

/**
 * Fill empty, never take. The user's 10040 tags with this deployment's
 * Assistant (`self`) set in `rows` — but a row is only set where nobody holds
 * that Duty, or `self` already does (`fillableRows`). A Duty another
 * Assistant holds (another deployment's, or an external service's), by its own
 * key or a broader one, is kept as it is unless its Duty group is in `take`:
 * the groups the person chose to move. Rows it isn't setting are kept.
 * Compares keys, never hosts.
 *
 * A row of ours is refreshed where it stands, so a Preferred stays Preferred
 * and its Alternates stay beside it. Taking a Duty drops the other
 * Assistants' rows of that same key; a broader key of theirs is kept — it
 * still gives them everything ours doesn't name.
 */
export function planDesignation(existing: string[][], rows: string[][], options: PlanOptions): string[][] {
  const me = options.self.toLowerCase();
  const mine = (t: string[]) => typeof t[1] === "string" && t[1].toLowerCase() === me;
  let tags = existing;
  for (const row of fillableRows(existing, rows, options)) {
    const taking = (holderOf(existing, row[0]) ?? me) !== me;
    let placed = false;
    tags = tags.flatMap((t) => {
      if (t[0] !== row[0]) return [t];
      if (!mine(t)) return taking ? [] : [t];
      if (placed) return [];
      placed = true;
      return [row];
    });
    if (!placed) tags = [...tags, row];
  }
  return tags;
}

/** The user's 10040 tags without the rows naming `key`; every other provider's rows are kept. */
export function withoutProvider(existing: string[][], key: string): string[][] {
  return existing.filter((t) => t[1] !== key);
}

const sameRelay = (a: unknown, b: string) =>
  String(a ?? "")
    .trim()
    .replace(/\/+$/, "") === b.trim().replace(/\/+$/, "");

/** Does this 10040 already name `key` on `relay` for every Trusted List kind? */
export function declaresLists(
  event: { tags: string[][] } | null | undefined,
  { key, relay }: ListDesignation,
): boolean {
  if (!event || !key || !relay) return false;
  return LIST_KINDS.every((kind) => event.tags.some((t) => t[0] === kind && t[1] === key && sameRelay(t[2], relay)));
}

/** What a 10040 says, read for people — a row's line, a page's card. */
export interface DesignationDescription {
  /** The assertion signals designated, in the order the spec lists them. */
  signals: string[];
  /** Whether any Trusted List kind is designated. */
  lists: boolean;
  providers: { pubkey: string; relay: string; brainstorm: boolean }[];
  /**
   * A self-Map: every row it reads names the Map's own author, as an
   * Assistant's own Treasure Map does (treasure-maps.md § 9.2). It entrusts
   * no one, so it is no activation: it says what its author publishes, and
   * where. Its `providers` are the author at those relays.
   */
  self: boolean;
  /** One line: "Activated Brainstorm trust signals · Rank, Followers". */
  summary: string;
}

/** The metrics Brainstorm's assistant signs, as `30382:<metric>` keys (NIP-85). */
const SIGNAL_LABEL: Record<string, string> = {
  "30382:rank": "Rank",
  "30382:followers": "Followers",
  "30382:reporters": "Reporters",
  "30382:muters": "Muters",
  "30382:hops": "Hops",
};

/**
 * Every assertion signal the Assistant publishes, in the order the spec lists
 * them. A Treasure Map gives the Assistant all five (issue #313): one naming
 * rank and followers alone left the other three with no provider.
 */
export const BRAINSTORM_SIGNALS = Object.keys(SIGNAL_LABEL);

/** A signal's name for people: `30382:hops` is "Hops". Unknown keys read as they are. */
export function signalLabel(signal: string): string {
  return SIGNAL_LABEL[signal] ?? signal;
}

/** The 10040 rows naming the assistant for every signal it publishes. */
export function signalRows(key: string, relay: string): string[][] {
  return BRAINSTORM_SIGNALS.map((signal) => [signal, key, relay]);
}

/**
 * The signals a Map leaves without a provider, when it gives the rank duty to
 * `taPubkey` on `relayUrl`: the ones among BRAINSTORM_SIGNALS that don't name
 * it there. A Map that gives rank to another Assistant is that service's to
 * complete, so nothing is missing from ours; no Map, no Assistant — nothing.
 * The remedy is a re-sign (useFinishSetup counts it as the Activate step).
 */
export function missingSignals(
  event: Pick<NostrEvent, "tags"> | null | undefined,
  taPubkey: string | null | undefined,
  relayUrl: string,
): string[] {
  if (!event || !taPubkey || !relayUrl) return [];
  const names = (signal: string) =>
    event.tags.some((t) => t[0] === signal && t[1] === taPubkey && sameRelay(t[2], relayUrl));
  if (!names("30382:rank")) return [];
  return BRAINSTORM_SIGNALS.filter((signal) => !names(signal));
}
const LIST_KIND_SET = new Set<string>(LIST_KINDS);
const isBrainstormRelay = (relay: string) => /(^|\.)brainstorm\.world\/?$/.test(relay.replace(/^wss?:\/\//, ""));

/**
 * A 10040 has no content — it is its rows: `[<what>, <provider pubkey>,
 * <relay>]`. Most on the search relay are Brainstorm activations, and were
 * rendered as a blank "Post"; this is what one says instead. A row naming the
 * Map's own author is a self-entry, which entrusts no one (§ 9.2): a Map of
 * nothing else is its author saying what it publishes, as an Assistant's own
 * Map does, never an activation; beside rows naming others it is left out.
 */
export function describeDesignation(event: { pubkey: string; tags: string[][] }): DesignationDescription {
  const author = event.pubkey.toLowerCase();
  const rows = event.tags.filter(([what, pubkey]) => pubkey && (SIGNAL_LABEL[what] || LIST_KIND_SET.has(what)));
  const others = rows.filter(([, pubkey]) => pubkey.toLowerCase() !== author);
  const self = rows.length > 0 && others.length === 0;
  const signals: string[] = [];
  let lists = false;
  const providers = new Map<string, { pubkey: string; relay: string; brainstorm: boolean }>();
  for (const [what, pubkey, relay = ""] of self ? rows : others) {
    const label = SIGNAL_LABEL[what];
    if (label && !signals.includes(label)) signals.push(label);
    if (LIST_KIND_SET.has(what)) lists = true;
    const key = `${pubkey}@${relay}`;
    if (!providers.has(key)) providers.set(key, { pubkey, relay, brainstorm: isBrainstormRelay(relay) });
  }
  const named = [...signals, ...(lists ? ["Trusted Lists"] : [])].join(", ");
  const provs = [...providers.values()];
  const summary = self
    ? `Publishes and keeps up to date · ${named}`
    : provs.length === 0
      ? "No trust provider designated"
      : provs.every((p) => p.brainstorm)
        ? `Activated Brainstorm trust signals · ${named}`
        : `Trusts a provider for ${named}`;
  return { signals, lists, providers: provs, self, summary };
}

/**
 * The specs a designation points its reader at, pinned by author. Four specs
 * on the search relay cover kind 10040, one of them a fork; "the first one
 * the relay returns" linked the fork. NIP-85 is Vitor Pamplona's; Trusted
 * Lists is Brainstorm's own, by David.
 */
export const CANONICAL_SPECS = {
  assertions: {
    kind: 30817,
    pubkey: "460c25e682fda7832b52d1f22d3d22b3176d972f60dcdc3212ed8c92ef85065c",
    identifier: "trusted-assertions",
    title: "Trusted Assertions (NIP-85)",
  },
  lists: {
    kind: 30817,
    pubkey: "e5272de914bd301755c439b88e6959a43c9d2664831f093c51e9c799a16a102f",
    identifier: "trusted-lists",
    title: "Trusted Lists",
  },
} as const;
