/**
 * Routstr (docs.routstr.com, github.com/Routstr/routstr-core): a network of nodes, each an
 * OpenAI-compatible proxy paid in sats, by Lightning or Cashu, that announces itself on
 * Nostr as a kind 38421. A Routstr key is an `sk-…` that works only on the node that sold
 * it, so the NIP-FA `["key", "sk-…", "https://<node>/v1"]` pair already says all of it.
 *
 * Pure: reading announcements, which endpoints a browser may call, `/v1/info`, the
 * `sats_pricing` in `/v1/models`, the balance, the error bodies, and Cashu tokens. The HTTP
 * half is `services/routstr`, the purchase in flight `lib/routstrPurchase`. Written from
 * live nodes (2026-11-13), which win where the docs disagree.
 *
 * Never log a key or a Cashu token: both are bearer money.
 */
import type { NostrEvent } from "nostr-tools";
import { nip19 } from "nostr-tools";

export const ROUTSTR_KIND = 38421;

/** Where nodes announce themselves (the Routstr docs). */
export const ROUTSTR_RELAYS = ["wss://relay.routstr.com", "wss://relay.damus.io", "wss://nos.lol"];

/** Nodes re-announce every 24 h: one not seen for a week is hidden unless asked for. */
export const FRESH_SECONDS = 7 * 24 * 3600;

/**
 * Not listed at all once not seen for 30 days (live nodes, 2026-11-13; Quartz's
 * `RoutstrNodeEvent.LISTED_MAX_AGE`): a node that stopped announcing a month ago is gone.
 */
export const LISTED_MAX_AGE = 30 * 24 * 3600;

// --- announcements -------------------------------------------------------------

export interface RoutstrNode {
  pubkey: string;
  identifier: string;
  /** The announcement's id, for React keys and nothing else. */
  id: string;
  name: string;
  about: string;
  version: string | null;
  mints: string[];
  /** The `models` tag, when the node lists them; null when it doesn't (most don't). */
  models: string[] | null;
  /** Every `u` endpoint as announced. */
  endpoints: string[];
  /** The ones this browser may call (`usableBase`), first is the one used. */
  https: string[];
  /** Whether it also has an `.onion` endpoint (unusable here: a browser has no Tor). */
  onion: boolean;
  /** `created_at`, unix seconds: when the node last announced itself. */
  seenAt: number;
  /** Typed by the reader rather than announced: no announcer to verify against. */
  typed?: boolean;
  /**
   * Another key announces the same endpoint too, and the node's `/v1/info` hasn't said (yet)
   * which one is its own: anyone can announce any URL, so the name may not be the node's.
   */
  contested?: boolean;
}

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/**
 * Top-level names that never resolve publicly, or that name another network (FIPS): the set
 * Quartz's `RoutstrEndpoint` refuses, so every client calls the same nodes.
 */
const NON_PUBLIC_TLDS = new Set([
  "local",
  "localhost",
  "localdomain",
  "internal",
  "intranet",
  "lan",
  "home",
  "corp",
  "private",
  "test",
  "invalid",
  "example",
  "arpa",
  "fips",
]);

/** `localhost`, `*.localhost`, `x.local`, `node.fips`…: a name no public DNS answers for. */
export function isNonPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const tld = host.slice(host.lastIndexOf(".") + 1);
  return NON_PUBLIC_TLDS.has(tld);
}

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw.trim());
  } catch {
    return null;
  }
}

/**
 * The endpoint as this browser may call it, `https://host[:port][/path]` with no trailing
 * slash, or null. Only `https`: never plain `http` (an `.onion` needs Tor, which a page
 * doesn't have, and anything else would send the key in the clear), never a reserved or
 * private-use name (`*.localhost`, `.local`, `.internal`, the `fips` style hosts…:
 * `isNonPublicHost`), never a host with no dot (`paygate`), never credentials in the URL,
 * and an IP literal only when the reader typed it.
 */
export function usableBase(raw: string, { typed = false }: { typed?: boolean } = {}): string | null {
  const u = parseUrl(raw);
  if (!u || u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  if (host.endsWith(".onion") || isNonPublicHost(host)) return null;
  const ip = IPV4.test(host) || host.startsWith("[");
  if (ip ? !typed : !host.includes(".")) return null;
  const path = u.pathname.replace(/\/+$/, "").replace(/\/v1$/, "");
  return `https://${u.host}${path}`;
}

const isOnion = (raw: string) => {
  const u = parseUrl(raw);
  return !!u && u.hostname.toLowerCase().endsWith(".onion");
};

/** The NIP-FA URL for a node: the API root under its base. */
export const nodeApiUrl = (base: string) => `${base.replace(/\/+$/, "")}/v1`;

/** The node a stored key URL belongs to: its base, without `/v1`. */
export const nodeBase = (apiUrl: string) => apiUrl.trim().replace(/\/+$/, "").replace(/\/v1$/, "");

function hostOf(base: string): string {
  return parseUrl(base)?.host ?? base;
}

function readContent(content: string): { name: string; about: string } {
  try {
    const json = JSON.parse(content) as { name?: unknown; about?: unknown };
    return {
      name: typeof json?.name === "string" ? json.name.trim() : "",
      about: typeof json?.about === "string" ? json.about.trim() : "",
    };
  } catch {
    return { name: "", about: "" };
  }
}

const tagValues = (event: NostrEvent, name: string) =>
  event.tags.filter((t) => t[0] === name && typeof t[1] === "string" && t[1].trim()).map((t) => t[1].trim());

/** One kind 38421, read as live nodes write it; null for anything else. */
export function parseAnnouncement(event: NostrEvent): RoutstrNode | null {
  if (event.kind !== ROUTSTR_KIND) return null;
  const identifier = event.tags.find((t) => t[0] === "d")?.[1] ?? "";
  const endpoints = tagValues(event, "u");
  const https = [...new Set(endpoints.map((u) => usableBase(u)).filter((u): u is string => !!u))];
  const { name, about } = readContent(event.content);
  const modelsTag = event.tags.find((t) => t[0] === "models");
  const models = modelsTag ? modelsTag.slice(1).filter((m) => typeof m === "string" && m.trim()) : null;
  return {
    pubkey: event.pubkey,
    identifier,
    id: event.id,
    name: name || (https[0] ? hostOf(https[0]) : `${event.pubkey.slice(0, 8)}…`),
    about,
    version: tagValues(event, "version")[0] ?? null,
    mints: [...new Set(tagValues(event, "mint"))],
    models: models && models.length ? models : null,
    endpoints,
    https,
    onion: endpoints.some(isOnion),
    seenAt: event.created_at,
  };
}

/**
 * The nodes a browser can use, newest announcement per address, fresh first. A node is an
 * announcer AND an endpoint: anyone can announce any URL, so two keys announcing the same
 * one are two entries, never one whose name the newest wins. When the node's own `/v1/info`
 * has said whose it is (`confirmed`, endpoint base to the announcing hex key, known only for
 * nodes already asked), only that announcer is listed for it; until then each is marked
 * `contested`. `stale` are the ones not seen for `FRESH_SECONDS`, kept apart so the list can
 * offer them on request; nothing older than `LISTED_MAX_AGE` is listed.
 */
export function nodesFrom(
  events: NostrEvent[],
  now: number,
  confirmed: ReadonlyMap<string, string> = new Map(),
): { fresh: RoutstrNode[]; stale: RoutstrNode[] } {
  const newest = new Map<string, NostrEvent>();
  for (const e of events) {
    if (e.kind !== ROUTSTR_KIND) continue;
    const address = `${e.pubkey}:${e.tags.find((t) => t[0] === "d")?.[1] ?? ""}`;
    const held = newest.get(address);
    if (!held || e.created_at > held.created_at || (e.created_at === held.created_at && e.id < held.id)) {
      newest.set(address, e);
    }
  }
  // One per announcer and endpoint (one key may announce one URL under two `d`s).
  const byAnnouncer = new Map<string, RoutstrNode>();
  for (const e of newest.values()) {
    if (now - e.created_at > LISTED_MAX_AGE) continue;
    const node = parseAnnouncement(e);
    if (!node || !node.https.length) continue;
    const id = `${node.pubkey}\n${node.https[0]}`;
    const held = byAnnouncer.get(id);
    if (!held || node.seenAt > held.seenAt) byAnnouncer.set(id, node);
  }
  const announcers = new Map<string, Set<string>>();
  for (const node of byAnnouncer.values()) {
    const set = announcers.get(node.https[0]) ?? new Set<string>();
    set.add(node.pubkey);
    announcers.set(node.https[0], set);
  }
  const all: RoutstrNode[] = [];
  for (const node of byAnnouncer.values()) {
    const owner = confirmed.get(node.https[0]);
    if (owner !== undefined) {
      // The node said whose it is: the others' claims to it are dropped.
      if (owner === node.pubkey) all.push(node);
      continue;
    }
    all.push(announcers.get(node.https[0])!.size > 1 ? { ...node, contested: true } : node);
  }
  all.sort((a, b) => b.seenAt - a.seenAt || a.name.localeCompare(b.name));
  return {
    fresh: all.filter((n) => now - n.seenAt <= FRESH_SECONDS),
    stale: all.filter((n) => now - n.seenAt > FRESH_SECONDS),
  };
}

/** The hex key a node's `/v1/info` names as its own; null when it names none that decodes. */
export function infoOwner(info: RoutstrInfo | null): string | null {
  if (!info) return null;
  try {
    const decoded = nip19.decode(info.npub);
    return decoded.type === "npub" ? decoded.data : null;
  } catch {
    return null;
  }
}

/** Search by name, about or host, case-insensitive. */
export function searchNodes(nodes: RoutstrNode[], query: string): RoutstrNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;
  return nodes.filter(
    (n) =>
      n.name.toLowerCase().includes(q) ||
      n.about.toLowerCase().includes(q) ||
      n.https.some((u) => u.toLowerCase().includes(q)),
  );
}

/** The host a node is called at, for display. */
export const nodeHost = (node: Pick<RoutstrNode, "https">) => (node.https[0] ? hostOf(node.https[0]) : "");

// --- /v1/info --------------------------------------------------------------------

export interface RoutstrInfo {
  name: string;
  description: string;
  version: string | null;
  npub: string;
  mints: string[];
  httpUrl: string | null;
  onionUrl: string | null;
}

/** `GET <node>/v1/info`; null unless it says it is a Routstr node (an `npub` and `mints`). */
export function parseInfo(json: unknown): RoutstrInfo | null {
  const o = json as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return null;
  if (typeof o.npub !== "string" || !o.npub.startsWith("npub1") || !Array.isArray(o.mints)) return null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    name: str(o.name) ?? "",
    description: str(o.description) ?? "",
    version: str(o.version),
    npub: o.npub,
    mints: o.mints.filter((m): m is string => typeof m === "string"),
    httpUrl: str(o.http_url),
    // Live nodes send it bare (`zdnt….onion`), without a scheme.
    onionUrl: str(o.onion_url),
  };
}

/**
 * Whether the node's own `npub` is the key that announced it: only then is it "Verified".
 * `info` must be the answer of the node's own https URL, never anything an announcement said.
 */
export function isVerified(info: RoutstrInfo | null, announcer: string | null | undefined): boolean {
  return !!announcer && infoOwner(info) === announcer;
}

// --- /v1/models ------------------------------------------------------------------

export interface PriceSet {
  /** Per token. */
  prompt: number;
  completion: number;
  /** Per request. */
  request: number;
  /** The most the node reserves for one request: the balance must cover it, or it answers 402. */
  maxCost: number | null;
}

export interface RoutstrModel {
  id: string;
  name: string | null;
  contextLength: number | null;
  /** Writes text (`architecture.output_modalities`); an embeddings model doesn't. */
  text: boolean;
  enabled: boolean;
  /** USD, OpenRouter's fields. */
  usd: PriceSet | null;
  /** Sats, the same fields. */
  sats: PriceSet | null;
  maxCompletionTokens: number | null;
}

/** A price as nodes send it: a number, or OpenRouter's decimal string. Never negative. */
function price(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function priceSet(raw: unknown): PriceSet | null {
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return null;
  const prompt = price(o.prompt);
  const completion = price(o.completion);
  if (prompt === null || completion === null) return null;
  return { prompt, completion, request: price(o.request) ?? 0, maxCost: price(o.max_cost) };
}

/** `GET <node>/v1/models`: every entry, with both price sets when given. */
export function parseModels(json: unknown): RoutstrModel[] {
  const list = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(list)) return [];
  const out: RoutstrModel[] = [];
  for (const raw of list) {
    const e = raw as Record<string, unknown> | null;
    if (!e || typeof e !== "object" || typeof e.id !== "string" || !e.id) continue;
    const arch = e.architecture as { output_modalities?: unknown } | undefined;
    const outputs = Array.isArray(arch?.output_modalities) ? arch.output_modalities : null;
    const top = e.top_provider as { max_completion_tokens?: unknown } | undefined;
    out.push({
      id: e.id,
      name: typeof e.name === "string" && e.name !== e.id ? e.name : null,
      contextLength: price(e.context_length),
      // No modalities said: assume it writes text, as OpenAI-shaped lists don't say.
      text: outputs ? outputs.includes("text") : true,
      enabled: e.enabled !== false,
      usd: priceSet(e.pricing),
      sats: priceSet(e.sats_pricing),
      maxCompletionTokens: price(top?.max_completion_tokens),
    });
  }
  return out;
}

/** The node's models a page can be written with: enabled, writing text. */
export const textModels = (models: RoutstrModel[]) => models.filter((m) => m.enabled && m.text);

/** Whether a models list is a Routstr node's: some entry carries `sats_pricing`. */
export function isRoutstrModels(json: unknown): boolean {
  const list = (json as { data?: unknown } | null)?.data;
  return Array.isArray(list) && list.some((e) => !!e && typeof e === "object" && "sats_pricing" in e);
}

// --- the estimate ------------------------------------------------------------------

export interface TokenEstimate {
  prompt: number;
  completion: number;
}

/**
 * One request's cost at [prices] for [tokens]:
 * `prompt * prompt_price + completion * completion_price + request`.
 */
export function estimateCost(prices: PriceSet | null, tokens: TokenEstimate): number | null {
  if (!prices) return null;
  return tokens.prompt * prices.prompt + tokens.completion * prices.completion + prices.request;
}

/** Sats for one edition, rounded up: a reader budgets in whole sats, and under is the wrong way to be off. */
export function estimateSats(model: RoutstrModel | null | undefined, tokens: TokenEstimate): number | null {
  const cost = estimateCost(model?.sats ?? null, tokens);
  return cost === null ? null : Math.max(1, Math.ceil(cost));
}

/** `1,234 sats`, `1 sat`. */
export function formatSats(sats: number, locale?: string): string {
  const n = Math.round(sats);
  return `${n.toLocaleString(locale)} ${n === 1 ? "sat" : "sats"}`;
}

/** `$0.12`, `<$0.01`. */
export function formatUsd(usd: number, locale?: string): string {
  if (usd < 0.01) return `<$${(0.01).toLocaleString(locale, { minimumFractionDigits: 2 })}`;
  return `$${usd.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** What one request needs on the balance: the node's reservation, and at least the estimate. */
export function satsNeeded(model: RoutstrModel | null | undefined, estimate: number | null): number | null {
  const reserve = model?.sats?.maxCost ?? null;
  const parts = [reserve === null ? null : Math.ceil(reserve), estimate].filter((n): n is number => n !== null);
  return parts.length ? Math.max(...parts) : null;
}

// --- the balance ---------------------------------------------------------------------

export interface RoutstrBalance {
  /** Spendable, in msats (the docs' `balance`). */
  msats: number;
  reservedMsats: number | null;
  totalRequests: number | null;
}

/** `GET /v1/balance/info`, an open object read defensively; `api_key` may be echoed and is never read. */
export function parseBalance(json: unknown): RoutstrBalance | null {
  const o = json as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return null;
  const msats = price(o.balance);
  if (msats === null) return null;
  return { msats, reservedMsats: price(o.reserved), totalRequests: price(o.total_requests) };
}

/** Whole sats from msats, rounded down: never claim a sat the node won't spend. */
export const msatsToSats = (msats: number) => Math.floor(msats / 1000);

/**
 * Whether the balance may not cover one print: under the model's `max_cost` (the node
 * refuses the request with 402) or under the edition's estimate. `short` is how many sats
 * to top up to cover both.
 */
export function lowBalance(
  balance: RoutstrBalance | null,
  model: RoutstrModel | null | undefined,
  estimate: number | null,
): { low: boolean; needed: number | null; short: number } {
  const needed = satsNeeded(model, estimate);
  if (!balance || needed === null) return { low: false, needed, short: 0 };
  const have = msatsToSats(balance.msats);
  return { low: have < needed, needed, short: Math.max(0, needed - have) };
}

// --- errors -----------------------------------------------------------------------

export interface RoutstrFailure {
  status: number;
  code: string | null;
  type: string | null;
  message: string | null;
  requiredMsats: number | null;
  availableMsats: number | null;
  shortfallMsats: number | null;
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * An error answer, whichever way the node wrapped it: `{"error": {...}}`, `{"detail":
 * {"error": {...}}}` (live nodes send both at once), `{"detail": "..."}` or a plain string.
 * The msats details may sit in the error, its `details`, or beside it.
 */
export function readRoutstrError(status: number, body: unknown): RoutstrFailure {
  let parsed: unknown = body;
  if (typeof body === "string") {
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = body;
    }
  }
  const root = asObject(parsed);
  const detail = asObject(root?.detail);
  const err = asObject(root?.error) ?? asObject(detail?.error) ?? detail;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const message =
    str(err?.message) ??
    str(root?.error) ??
    str(root?.detail) ??
    str(detail?.message) ??
    (typeof parsed === "string" ? str(parsed) : null);
  const places = [err, asObject(err?.details), detail, asObject(detail?.details), root].filter(
    (p): p is Record<string, unknown> => !!p,
  );
  const find = (name: string) => {
    for (const p of places) {
      const n = price(p[name]);
      if (n !== null) return n;
    }
    return null;
  };
  return {
    status,
    code: str(err?.code)?.toLowerCase() ?? null,
    type: str(err?.type),
    message,
    requiredMsats: find("required_msats"),
    availableMsats: find("available_msats"),
    shortfallMsats: find("shortfall_msats"),
  };
}

export type RoutstrProblemKind =
  "low-balance" | "wrong-node" | "key-expired" | "upstream-down" | "rate-limited" | "settlement-failed" | "bad-token";

export interface RoutstrProblem {
  kind: RoutstrProblemKind;
  text: string;
  /** Sats to top up, when the node said. */
  topUp?: number;
  /** The node charged and kept the answer: sending it again would pay twice. */
  noResend?: boolean;
}

/**
 * What a Routstr failure means for the reader, or null when it isn't one of Routstr's (the
 * caller says it its own way). By code first, as live nodes send them; 402, 424 and the
 * 503 settlement by status too, since a node behind a proxy may lose the code.
 */
export function routstrProblem(failure: RoutstrFailure): RoutstrProblem | null {
  const { status, code } = failure;
  if (code === "insufficient_balance" || (status === 402 && failure.shortfallMsats !== null)) {
    const shortfall =
      failure.shortfallMsats ??
      (failure.requiredMsats !== null && failure.availableMsats !== null
        ? failure.requiredMsats - failure.availableMsats
        : null);
    const topUp = shortfall !== null && shortfall > 0 ? Math.ceil(shortfall / 1000) : null;
    return {
      kind: "low-balance",
      text: topUp
        ? `Your Routstr balance is too low for this model: top up ${formatSats(topUp)}.`
        : "Your Routstr balance is too low for this model: top it up.",
      ...(topUp ? { topUp } : {}),
    };
  }
  if (code === "key_not_found") {
    return {
      kind: "wrong-node",
      text: "This key isn't on this node. A Routstr key works only on the node that sold it.",
    };
  }
  // `invalid_api_key` is not read as Routstr's: OpenAI answers a bad key with the same code,
  // and the caller's own "key rejected" is right for both.
  if (code === "key_expired") return { kind: "key-expired", text: "This Routstr key has expired." };
  if (code === "invalid_cashu_token" || code === "token_already_spent") {
    return { kind: "bad-token", text: failure.message ?? "The node didn't take that Cashu token." };
  }
  if (code === "upstream_unavailable" || status === 424) {
    return {
      kind: "upstream-down",
      text: "The node's AI provider is down. Nothing was spent: try later, or another node.",
    };
  }
  if (code === "upstream_rate_limit") {
    return { kind: "rate-limited", text: "The node's AI provider is rate-limiting it. Try again in a minute." };
  }
  if (code === "payment_settlement_failed" || (status === 503 && /settle/i.test(failure.message ?? ""))) {
    return {
      kind: "settlement-failed",
      text: "The Routstr node charged for this answer but didn't send it. It isn't sent again: check your balance before you print again.",
      noResend: true,
    };
  }
  return null;
}

// --- Cashu and keys -----------------------------------------------------------------

/**
 * A Cashu token (`cashuA…` v3, `cashuB…` v4), with or without a `cashu:` link prefix.
 * Bearer money: it is never stored as a key, and never sent as one.
 */
export function cashuToken(input: string): string | null {
  const s = input.trim().replace(/^cashu:(?=cashu)/i, "");
  return /^cashu[AB][A-Za-z0-9_\-+/=]{8,}$/.test(s) ? s : null;
}

/** Whether it looks like a Routstr key (`sk-` and a long tail). */
export const looksLikeRoutstrKey = (input: string) => /^sk-[A-Za-z0-9_-]{16,}$/.test(input.trim());

export interface CashuChange {
  token: string;
  amount: number | null;
  unit: string | null;
}

/** The change a node hands back from a foreign-mint token: money that goes back to the reader. */
export function readChange(json: unknown): CashuChange | null {
  const o = asObject(json);
  const token = typeof o?.change_token === "string" ? cashuToken(o.change_token) : null;
  if (!token) return null;
  return {
    token,
    amount: price(o?.change_amount),
    unit: typeof o?.change_unit === "string" ? o.change_unit : null,
  };
}

/** `POST /v1/balance/create`: the new key (never logged), its balance, and any change. */
export function readCreated(json: unknown): {
  apiKey: string | null;
  msats: number | null;
  change: CashuChange | null;
} {
  const o = asObject(json);
  const apiKey = typeof o?.api_key === "string" && o.api_key.trim() ? o.api_key.trim() : null;
  return { apiKey, msats: price(o?.balance), change: readChange(json) };
}

/** `POST /v1/balance/topup`: what was added (msats, as live nodes send it) and any change. */
export function readTopup(json: unknown): { msats: number | null; change: CashuChange | null } {
  const o = asObject(json);
  return { msats: price(o?.msats) ?? price(o?.amount_msats), change: readChange(json) };
}

// --- Lightning invoices ------------------------------------------------------------

export interface RoutstrInvoice {
  invoiceId: string;
  bolt11: string;
  amountSats: number;
  /** Unix seconds. */
  expiresAt: number;
  paymentHash: string | null;
}

/** `POST /v2/lightning/invoice`; null when it isn't one. */
export function parseInvoice(json: unknown): RoutstrInvoice | null {
  const o = asObject(json);
  if (!o || typeof o.invoice_id !== "string" || typeof o.bolt11 !== "string") return null;
  if (!/^ln/i.test(o.bolt11)) return null;
  const amount = price(o.amount_sats);
  const expires = price(o.expires_at);
  if (amount === null || expires === null) return null;
  return {
    invoiceId: o.invoice_id,
    bolt11: o.bolt11,
    amountSats: amount,
    expiresAt: expires,
    paymentHash: typeof o.payment_hash === "string" ? o.payment_hash : null,
  };
}

export interface InvoiceStatus {
  status: string;
  /** Set once a `create` invoice is paid. Never logged. */
  apiKey: string | null;
  expiresAt: number | null;
  paidAt: number | null;
}

/** `GET /v2/lightning/invoice/{id}/status` and `POST /v2/lightning/recover`. */
export function parseInvoiceStatus(json: unknown): InvoiceStatus | null {
  const o = asObject(json);
  if (!o || typeof o.status !== "string") return null;
  return {
    status: o.status.toLowerCase(),
    apiKey: typeof o.api_key === "string" && o.api_key.trim() ? o.api_key.trim() : null,
    expiresAt: price(o.expires_at),
    paidAt: price(o.paid_at),
  };
}

/** The amounts "Get a key" offers first. */
export const KEY_AMOUNTS = [1_000, 5_000, 20_000];
/** The node's own cap on one invoice (`InvoiceCreateRequest.amount_sats`). */
export const MAX_INVOICE_SATS = 1_000_000;
