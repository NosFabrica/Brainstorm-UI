/**
 * Routstr's HTTP half (lib/routstr holds the formats): a node's `/v1/info`, `/v1/models`
 * and `/v1/balance/info`, its Lightning invoices (`/v2/lightning/…`) and its Cashu calls
 * (`/v1/balance/create`, `/v1/balance/topup`), and the kind 38421 ask that lists nodes.
 *
 * Nodes are asked from this page directly; live ones answer CORS for any origin. A node is
 * asked for its models only when the reader picks it or holds a key there (lib/routstr,
 * "Privacy"). Not react-query: these are other people's servers, not the Brainstorm API,
 * and the few answers worth keeping (is it a node, its models, a key's balance) are kept
 * here for the session, shared by every screen that shows them.
 *
 * Never log a key or a token.
 */
import { useEffect, useSyncExternalStore } from "react";
import type { NostrEvent } from "nostr-tools";
import { requestAll } from "@/lib/relayRequest";
import { presetForUrl, type AgentKey } from "@/lib/agentKeys";
import {
  ROUTSTR_KIND,
  ROUTSTR_RELAYS,
  isRoutstrModels,
  nodeBase,
  parseBalance,
  parseInfo,
  parseInvoice,
  parseInvoiceStatus,
  parseModels,
  readCreated,
  readRoutstrError,
  readTopup,
  routstrProblem,
  type CashuChange,
  type RoutstrBalance,
  type RoutstrFailure,
  type RoutstrInfo,
  type RoutstrInvoice,
  type RoutstrModel,
  type RoutstrProblem,
} from "@/lib/routstr";
import type { NodeAnswer, PurchasePurpose } from "@/lib/routstrPurchase";

/** A node answered with a failure. `message` is written for the reader. */
export class RoutstrError extends Error {
  readonly problem: RoutstrProblem | null;
  constructor(
    readonly failure: RoutstrFailure,
    fallback: string,
  ) {
    const problem = routstrProblem(failure);
    super(problem?.text ?? failure.message ?? fallback);
    this.name = "RoutstrError";
    this.problem = problem;
  }
}

/** The node didn't answer at all: down, wrong, or not letting this page call it. */
export class RoutstrUnreachable extends Error {
  constructor() {
    super("Couldn't reach that Routstr node from this page.");
    this.name = "RoutstrUnreachable";
  }
}

const TIMEOUT_MS = 15_000;

async function call(
  url: string,
  init: RequestInit = {},
  timeoutMs = TIMEOUT_MS,
): Promise<{ status: number; ok: boolean; body: unknown }> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new RoutstrUnreachable();
  }
  const text = await response.text().catch(() => "");
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON: kept as text, for the error reader */
  }
  return { status: response.status, ok: response.ok, body };
}

const bearer = (key: string) => ({ Authorization: `Bearer ${key}` });
const json = { "Content-Type": "application/json" };

// --- discovery ---------------------------------------------------------------------

/** The kind 38421 ask behind the node list: every announcement the discovery relays hold, into the store. */
export function loadRoutstrNodes(timeoutMs = 8000): Promise<NostrEvent[]> {
  return requestAll(ROUTSTR_RELAYS, { kinds: [ROUTSTR_KIND], limit: 500 }, timeoutMs);
}

// --- what a node is ------------------------------------------------------------------

const infos = new Map<string, Promise<RoutstrInfo | null>>();

/**
 * `GET <node>/v1/info`, once per node per session: null when it answered and isn't a
 * Routstr node. A node that didn't answer is asked again next time.
 */
export function getNodeInfo(apiUrl: string): Promise<RoutstrInfo | null> {
  const base = nodeBase(apiUrl);
  const held = infos.get(base);
  if (held) return held;
  const ask = call(`${base}/v1/info`).then(
    ({ ok, body }) => (ok ? parseInfo(body) : null),
    (err) => {
      infos.delete(base);
      throw err;
    },
  );
  infos.set(base, ask);
  return ask;
}

const modelLists = new Map<string, { at: number; ask: Promise<RoutstrModel[]> }>();
const MODELS_MS = 10 * 60_000;

/** `GET <node>/v1/models` with its prices, kept ten minutes per node. Public: no key is sent. */
export function getNodeModels(apiUrl: string): Promise<RoutstrModel[]> {
  const base = nodeBase(apiUrl);
  const held = modelLists.get(base);
  if (held && Date.now() - held.at < MODELS_MS) return held.ask;
  const ask = call(`${base}/v1/models`).then(({ ok, status, body }) => {
    if (!ok) throw new RoutstrError(readRoutstrError(status, body), `The node answered ${status}.`);
    if (isRoutstrModels(body)) setDetected(base, true);
    return parseModels(body);
  });
  ask.catch(() => modelLists.delete(base));
  modelLists.set(base, { at: Date.now(), ask });
  return ask;
}

/** What is known of each endpoint: `true` a Routstr node, `false` not one. */
const detected = new Map<string, boolean>();
const detectListeners = new Set<() => void>();
function setDetected(base: string, yes: boolean) {
  if (detected.get(base) === yes) return;
  detected.set(base, yes);
  detectListeners.forEach((l) => l());
}

/** Synchronously: whether this endpoint is known to be a Routstr node (preset, or asked). */
export function knownRoutstr(apiUrl: string): boolean | undefined {
  const preset = presetForUrl(apiUrl);
  if (preset) return preset.id === "routstr";
  return detected.get(nodeBase(apiUrl));
}

/** Endpoints never worth asking: a known provider that isn't Routstr, this computer. */
function worthAsking(apiUrl: string): boolean {
  const preset = presetForUrl(apiUrl);
  if (preset) return preset.id === "routstr";
  try {
    const u = new URL(apiUrl);
    return u.protocol === "https:" && u.hostname !== "localhost";
  } catch {
    return false;
  }
}

/**
 * Whether an endpoint is a Routstr node: its `/v1/info` answers with an `npub` and
 * `mints`. Asked once per endpoint per session, and never of a provider we know.
 */
export async function detectRoutstr(apiUrl: string): Promise<boolean> {
  const known = knownRoutstr(apiUrl);
  if (known !== undefined) return known;
  if (!worthAsking(apiUrl)) return false;
  const base = nodeBase(apiUrl);
  try {
    const info = await getNodeInfo(apiUrl);
    setDetected(base, !!info);
    return !!info;
  } catch {
    return false;
  }
}

/** Marks an endpoint a Routstr node: one the reader picked from the list, or verified by hand. */
export const markRoutstr = (apiUrl: string) => setDetected(nodeBase(apiUrl), true);

/** Whether `apiUrl` is a Routstr node, live: undefined while it is being asked. */
export function useIsRoutstr(apiUrl: string | null | undefined): boolean | undefined {
  const value = useSyncExternalStore(
    (l) => {
      detectListeners.add(l);
      return () => detectListeners.delete(l);
    },
    () => (apiUrl ? knownRoutstr(apiUrl) : false),
  );
  useEffect(() => {
    if (apiUrl && knownRoutstr(apiUrl) === undefined) void detectRoutstr(apiUrl);
  }, [apiUrl]);
  return value;
}

// --- the balance ------------------------------------------------------------------

/** `GET /v1/balance/info` with the key. Throws `RoutstrError` (a 401 `key_not_found`: not this node's key). */
export async function getBalance(entry: AgentKey, signal?: AbortSignal): Promise<RoutstrBalance> {
  const { ok, status, body } = await call(`${nodeBase(entry.url)}/v1/balance/info`, {
    headers: bearer(entry.key),
    signal,
  });
  if (!ok) throw new RoutstrError(readRoutstrError(status, body), `The node answered ${status}.`);
  const balance = parseBalance(body);
  if (!balance) throw new RoutstrError(readRoutstrError(status, body), "The node's answer had no balance.");
  setDetected(nodeBase(entry.url), true);
  return balance;
}

export type BalanceState =
  | { status: "loading" }
  | { status: "ready"; balance: RoutstrBalance; at: number }
  | { status: "failed"; error: string; problem: RoutstrProblem | null };

/** In memory, keyed by endpoint and key: the key never leaves this map, and is never logged. */
const balances = new Map<string, BalanceState>();
const balanceAsks = new Map<string, Promise<void>>();
const balanceListeners = new Set<() => void>();
const LOADING: BalanceState = { status: "loading" };
const balanceId = (entry: AgentKey) => `${nodeBase(entry.url)}\n${entry.key}`;

/** Asks the balance again (after a top-up, on opening a screen); one ask at a time per key. */
export function refreshBalance(entry: AgentKey): Promise<void> {
  const id = balanceId(entry);
  const out = balanceAsks.get(id);
  if (out) return out;
  const ask = getBalance(entry)
    .then(
      (balance): BalanceState => ({ status: "ready", balance, at: Date.now() }),
      (err): BalanceState => ({
        status: "failed",
        error: err instanceof Error ? err.message : "Couldn't read the balance.",
        problem: err instanceof RoutstrError ? err.problem : null,
      }),
    )
    .then((state) => {
      balances.set(id, state);
      balanceAsks.delete(id);
      balanceListeners.forEach((l) => l());
    });
  balanceAsks.set(id, ask);
  return ask;
}

/** Asks again every balance this session shows for one node (a top-up landed there). */
export function refreshBalancesAt(apiUrl: string): Promise<void[]> {
  const base = nodeBase(apiUrl);
  const asks: Promise<void>[] = [];
  for (const id of balances.keys()) {
    const [at, key] = id.split("\n");
    if (at === base && key) asks.push(refreshBalance({ key, url: `${base}/v1` }));
  }
  return Promise.all(asks);
}

/**
 * A Routstr key's balance, shared by the key card, the print card and the schedule. Asked
 * when the first of them mounts (the screen opens), and again on `refreshBalance`. Null for
 * no key, or a key that isn't a Routstr node's.
 */
export function useRoutstrBalance(entry: AgentKey | null, enabled = true): BalanceState | null {
  const id = entry && enabled ? balanceId(entry) : null;
  const state = useSyncExternalStore(
    (l) => {
      balanceListeners.add(l);
      return () => balanceListeners.delete(l);
    },
    () => (id ? (balances.get(id) ?? LOADING) : null),
  );
  useEffect(() => {
    if (entry && id) void refreshBalance(entry);
    // `id` is the entry, as a value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return state;
}

/** For tests: forget what this session learned. */
export function resetRoutstrCaches() {
  infos.clear();
  modelLists.clear();
  detected.clear();
  balances.clear();
  balanceAsks.clear();
}

// --- Lightning ----------------------------------------------------------------------

/**
 * `POST /v2/lightning/invoice`. A top-up names its key in `Authorization` (the body's
 * `api_key` is deprecated on live nodes). Making an invoice moves no money.
 */
export async function createInvoice(
  apiUrl: string,
  amountSats: number,
  purpose: PurchasePurpose,
  topUpKey?: string,
): Promise<RoutstrInvoice> {
  const { ok, status, body } = await call(`${nodeBase(apiUrl)}/v2/lightning/invoice`, {
    method: "POST",
    headers: { ...json, ...(purpose === "topup" && topUpKey ? bearer(topUpKey) : {}) },
    body: JSON.stringify({ amount_sats: amountSats, purpose }),
  });
  if (!ok) throw new RoutstrError(readRoutstrError(status, body), `The node couldn't make an invoice (${status}).`);
  const invoice = parseInvoice(body);
  if (!invoice) throw new RoutstrError(readRoutstrError(status, body), "The node's invoice couldn't be read.");
  return invoice;
}

function answerOf(status: number, ok: boolean, body: unknown): NodeAnswer {
  if (status === 404) return { type: "not-found" };
  if (!ok) return { type: "unreachable" };
  const read = parseInvoiceStatus(body);
  return read ? { type: "status", status: read.status, apiKey: read.apiKey } : { type: "unreachable" };
}

/** `GET /v2/lightning/invoice/{id}/status`. Never throws: silence is `unreachable`. */
export async function invoiceStatus(apiUrl: string, invoiceId: string): Promise<NodeAnswer> {
  try {
    const { status, ok, body } = await call(
      `${nodeBase(apiUrl)}/v2/lightning/invoice/${encodeURIComponent(invoiceId)}/status`,
    );
    return answerOf(status, ok, body);
  } catch {
    return { type: "unreachable" };
  }
}

/** `POST /v2/lightning/recover` by the bolt11: for a paid invoice whose id was lost. */
export async function recoverInvoice(apiUrl: string, bolt11: string): Promise<NodeAnswer> {
  try {
    const { status, ok, body } = await call(`${nodeBase(apiUrl)}/v2/lightning/recover`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ bolt11 }),
    });
    return answerOf(status, ok, body);
  } catch {
    return { type: "unreachable" };
  }
}

// --- Cashu -----------------------------------------------------------------------

/**
 * `POST /v1/balance/create`: a token becomes a key. Sending the same token again gives
 * back the same key (the node keys it by the token), so after silence the reader can
 * safely try again with it.
 */
export async function createWithCashu(
  apiUrl: string,
  token: string,
): Promise<{ apiKey: string; msats: number | null; change: CashuChange | null }> {
  const { ok, status, body } = await call(
    `${nodeBase(apiUrl)}/v1/balance/create`,
    { method: "POST", headers: json, body: JSON.stringify({ initial_balance_token: token }) },
    60_000,
  );
  if (!ok) throw new RoutstrError(readRoutstrError(status, body), `The node didn't take the token (${status}).`);
  const created = readCreated(body);
  if (!created.apiKey) throw new RoutstrError(readRoutstrError(status, body), "The node's answer had no key.");
  return { apiKey: created.apiKey, msats: created.msats, change: created.change };
}

/**
 * `POST /v1/balance/topup` with the key: a token added to its balance. A token from a mint
 * the node doesn't trust is swapped, and the node may hand back change: it is the reader's.
 */
export async function topupWithCashu(
  entry: AgentKey,
  token: string,
): Promise<{ msats: number | null; change: CashuChange | null }> {
  const { ok, status, body } = await call(
    `${nodeBase(entry.url)}/v1/balance/topup`,
    { method: "POST", headers: { ...json, ...bearer(entry.key) }, body: JSON.stringify({ cashu_token: token }) },
    60_000,
  );
  if (!ok) throw new RoutstrError(readRoutstrError(status, body), `The node didn't take the token (${status}).`);
  return readTopup(body);
}
