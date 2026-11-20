/**
 * Runs a Routstr purchase from invoice to saved key (lib/routstrPurchase holds the record
 * and the rules). The order is the money's: the record is kept before the invoice is shown
 * (or the Cashu token sent), a key the node hands over is kept before it is saved, and the
 * record goes only once a read of kind 12000 after the save shows the key there.
 *
 * Every write of a record after a call to the node goes over the record as it is then
 * (`updatePurchase`): the wallet, another tab or the reader may have moved it meanwhile.
 */
import { addKey, type AgentKey } from "@/lib/agentKeys";
import { keySuffix } from "@/lib/assistantKeys";
import { msatsToSats, nodeApiUrl, nodeBase, type CashuChange } from "@/lib/routstr";
import {
  advance,
  dropIfDroppable,
  letGo,
  localId,
  putPurchase,
  readPurchases,
  removePurchase,
  updatePurchase,
  type NodeAnswer,
  type PendingPurchase,
  type PurchasePurpose,
} from "@/lib/routstrPurchase";
import { agentKeysHold, updateAgentKeys } from "@/services/agentKeys";
import { activeAccount, canSignUnasked } from "@/accounts/signing";
import { purchasesInView } from "@/services/routstrPurchasePoller";
import {
  RoutstrError,
  createInvoice,
  createWithCashu,
  getBalance,
  invoiceStatus,
  recoverInvoice,
  refreshBalance,
  refundKey,
  topupWithCashu,
} from "@/services/routstr";

/** What saving a key came to. `notActive`: another account is signed in now, so nothing was tried. */
export type KeySave = { ok: true } | { ok: false; error?: string; notActive?: boolean; declined?: boolean };

/** What the driver calls, so tests (and nothing else) can stand in for the node and the signer. */
export interface PurchaseDeps {
  status: (apiUrl: string, invoiceId: string) => Promise<NodeAnswer>;
  recover: (apiUrl: string, bolt11: string) => Promise<NodeAnswer>;
  /** Saves `entry` into `pubkey`'s kind 12000, refusing when another account is active. */
  saveKey: (pubkey: string, entry: AgentKey) => Promise<KeySave>;
  /** Whether `pubkey`'s kind 12000, read again, holds `entry`; null when it can't tell. */
  keyHeld: (pubkey: string, entry: AgentKey) => Promise<boolean | null>;
  /** Whether a key exists on its node (its balance answers): `missing` for a 401 `key_not_found`. */
  keyLive: (entry: AgentKey) => Promise<"live" | "missing" | "unknown">;
  /** Whether `pubkey`'s signer signs and decrypts without asking anyone (a key held here, unlocked). */
  signsUnasked?: (pubkey: string) => Promise<boolean>;
  now: () => number;
}

export const defaultDeps: PurchaseDeps = {
  status: invoiceStatus,
  recover: recoverInvoice,
  saveKey: async (pubkey, entry) => {
    const outcome = await updateAgentKeys((cur) => addKey(cur, entry), { pubkey });
    if (outcome.success) return { ok: true };
    if (outcome.cancelled || outcome.declined) return { ok: false, declined: true };
    return { ok: false, error: outcome.error ?? "Couldn't save the key.", notActive: outcome.notActive };
  },
  keyHeld: (pubkey, entry) => agentKeysHold(pubkey, entry),
  keyLive: async (entry) => {
    try {
      await getBalance(entry);
      return "live";
    } catch (err) {
      return err instanceof RoutstrError && err.failure.code === "key_not_found" ? "missing" : "unknown";
    }
  },
  signsUnasked: async (pubkey) => {
    const account = activeAccount();
    return !!account && account.pubkey === pubkey && (await canSignUnasked(account));
  },
  now: () => Math.floor(Date.now() / 1000),
};

/**
 * Records whose signer said no (or gave no answer), by `pubkey:id`: the background asks it
 * again only after a wait that doubles each time, up to half an hour. A Retry clears it.
 */
const quiet = new Map<string, { until: number; wait: number }>();
const QUIET_FIRST_MS = 30_000;
const QUIET_MAX_MS = 30 * 60_000;

function backOff(pubkey: string, id: string) {
  const key = `${pubkey}:${id}`;
  const wait = Math.min((quiet.get(key)?.wait ?? QUIET_FIRST_MS / 2) * 2, QUIET_MAX_MS);
  quiet.set(key, { until: Date.now() + wait, wait });
}

/**
 * Whether this turn may ask the signer (a save signs kind 12000, a read back decrypts it).
 * Asked by the reader (Retry, a purchase they just made), or with the AI model page open,
 * yes; from the background, only when nobody would be prompted, and not while backing off.
 */
async function mayAskSigner(pubkey: string, id: string, deps: PurchaseDeps, background: boolean) {
  if (!background) {
    quiet.delete(`${pubkey}:${id}`);
    return true;
  }
  const held = quiet.get(`${pubkey}:${id}`);
  if (held && Date.now() < held.until) return false;
  if (purchasesInView()) return true;
  return (await deps.signsUnasked?.(pubkey)) ?? true;
}

const NOT_KEPT = "This browser won't keep the purchase safe while it's paid (private browsing?). Nothing was bought.";

/**
 * A Lightning invoice for a new key or a top-up, kept on this device before it is returned:
 * nothing is shown to pay until a reload can find it again.
 */
export async function startLightningPurchase({
  pubkey,
  node,
  nodeName,
  amountSats,
  purpose,
  topUpKey,
}: {
  pubkey: string;
  node: string;
  nodeName: string | null;
  amountSats: number;
  purpose: PurchasePurpose;
  topUpKey?: string;
}): Promise<PendingPurchase> {
  const apiUrl = nodeApiUrl(nodeBase(node));
  const invoice = await createInvoice(apiUrl, amountSats, purpose, topUpKey);
  const record: PendingPurchase = {
    id: invoice.invoiceId || invoice.paymentHash || localId(),
    node: apiUrl,
    nodeName,
    purpose,
    method: "lightning",
    invoiceId: invoice.invoiceId,
    bolt11: invoice.bolt11,
    amountSats: invoice.amountSats,
    expiresAt: invoice.expiresAt,
    createdAt: Date.now(),
    ...(purpose === "topup" && topUpKey ? { topsUp: keySuffix({ key: topUpKey, url: apiUrl }) } : {}),
  };
  if (!putPurchase(pubkey, record)) throw new Error(NOT_KEPT);
  return record;
}

/**
 * This device is about to ask its wallet to pay it: kept first, so a payment still in flight
 * (or one that settles late) never lets the record be dropped. False when it isn't kept: the
 * wallet must not be asked then.
 */
export function markPayAttempted(pubkey: string, id: string): boolean {
  const record = readPurchases(pubkey).find((r) => r.id === id);
  return !!record && updatePurchase(pubkey, { ...record, payAttempted: true });
}

/** This device's wallet paid it: kept whatever the node says until the node agrees. */
export function markPaidHere(pubkey: string, id: string) {
  const record = readPurchases(pubkey).find((r) => r.id === id);
  if (record) updatePurchase(pubkey, { ...record, paidHere: true });
}

/**
 * `confirmed`: a read of kind 12000 after the save showed the key, and the record went. The
 * poller says nothing of it: `saved` was said when it was written.
 */
export type PollOutcome = "waiting" | "saved" | "unsaved" | "confirmed" | "topped-up" | "dropped" | "gone";

/**
 * One turn of the machine for one record: ask the node (by id, else by the bolt11), apply
 * the answer, and save a key the moment one arrives. The record on disk is updated before
 * anything that could fail, so a reload at any point resumes from where this left off.
 */
/**
 * `background`: the app's poller, with nobody looking. A turn that would ask the signer then
 * waits (`mayAskSigner`) for the AI model page, a Retry, or a signer that asks nobody.
 */
export async function pollPurchase(
  pubkey: string,
  id: string,
  deps: PurchaseDeps = defaultDeps,
  { background = false }: { background?: boolean } = {},
): Promise<PollOutcome> {
  let record = readPurchases(pubkey).find((r) => r.id === id);
  if (!record) return "gone";
  if (record.key) {
    // A Cashu token sent with no answer: its key exists only if the node took it.
    if (record.unconfirmed) return checkCashuKey(pubkey, record, deps);
    // Written: let it go once kind 12000, read again, shows it; write it again if it doesn't.
    if (record.savedAt) return confirmSaved(pubkey, record, deps, background);
    // A key in hand (a save that failed, a Cashu purchase): save it, ask the node nothing.
    return saveBought(pubkey, record, deps, background);
  }
  if (record.ended) return "waiting";
  if (record.method !== "lightning" || !record.bolt11) return record.change ? "waiting" : "gone";

  let answer: NodeAnswer = record.invoiceId
    ? await deps.status(record.node, record.invoiceId)
    : await deps.recover(record.node, record.bolt11);
  let from: "status" | "recover" = record.invoiceId ? "status" : "recover";
  for (let turn = 0; turn < 2; turn++) {
    const step = advance(record, answer, deps.now(), from);
    // The id said nothing about it (lost, or paid without a key): the bolt11 names it.
    if (step.next === "recover" && from === "status") {
      record = step.record;
      if (!updatePurchase(pubkey, record)) return "gone";
      answer = await deps.recover(record.node, record.bolt11!);
      from = "recover";
      continue;
    }
    switch (step.next) {
      case "wait":
      case "recover":
        return updatePurchase(pubkey, step.record) ? "waiting" : "gone";
      case "drop":
        // Only if, as it is now, nothing says it was paid (the wallet may have, meanwhile).
        if (dropIfDroppable(pubkey, record.id, deps.now())) return "dropped";
        return readPurchases(pubkey).some((r) => r.id === record!.id) ? "waiting" : "gone";
      case "done":
        removePurchase(pubkey, record.id);
        return "topped-up";
      case "save":
        // Kept first: the key is the reader's money, and the save below may fail or the tab
        // close. The one write that brings a record back: a key the node just handed over
        // is kept whatever happened to the record meanwhile.
        if (!updatePurchase(pubkey, step.record)) putPurchase(pubkey, step.record);
        return saveBought(pubkey, readPurchases(pubkey).find((r) => r.id === id) ?? step.record, deps, background);
    }
  }
  return "waiting";
}

/** Records whose key is being saved or checked now: a second turn (the poller beside the screen) waits. */
const saving = new Set<string>();

async function once(pubkey: string, record: PendingPurchase, work: () => Promise<PollOutcome>): Promise<PollOutcome> {
  const id = `${pubkey}:${record.id}`;
  if (saving.has(id)) return "waiting";
  saving.add(id);
  try {
    return await work();
  } finally {
    saving.delete(id);
  }
}

function saveBought(
  pubkey: string,
  record: PendingPurchase,
  deps: PurchaseDeps,
  background = false,
): Promise<PollOutcome> {
  return once(pubkey, record, async () => {
    if (!(await mayAskSigner(pubkey, record.id, deps, background))) return "waiting";
    const entry: AgentKey = { key: record.key!, url: record.node };
    const saved: KeySave = await deps.saveKey(pubkey, entry).catch(() => ({ ok: false }) as const);
    const now = readPurchases(pubkey).find((r) => r.id === record.id) ?? record;
    // Another account is signed in now (a switch, a sign-out mid-turn): this one's key waits
    // for it, untouched, with no error to stop the poller and nothing to say.
    if (!saved.ok && saved.notActive) return "waiting";
    // They said no to the unlock (or the signer did): the key stays, unsaved, with nothing
    // alarming to say, and the background asks again only after a while.
    if (!saved.ok && saved.declined) {
      backOff(pubkey, record.id);
      return "waiting";
    }
    if (!saved.ok) {
      updatePurchase(pubkey, { ...now, saveError: saved.error ?? "Couldn't save the key." });
      return "unsaved";
    }
    updatePurchase(pubkey, { ...now, saveError: undefined, savedAt: Date.now() });
    return "saved";
  });
}

/** A saved key: the record goes once a read shows it in kind 12000; one a later write undid is saved again. */
function confirmSaved(
  pubkey: string,
  record: PendingPurchase,
  deps: PurchaseDeps,
  background = false,
): Promise<PollOutcome> {
  return once(pubkey, record, async () => {
    if (!(await mayAskSigner(pubkey, record.id, deps, background))) return "waiting";
    const held = await deps.keyHeld(pubkey, { key: record.key!, url: record.node });
    if (held === null) {
      // Couldn't tell (a declined decrypt, relays that didn't answer): not again at once.
      if (background) backOff(pubkey, record.id);
      return "waiting";
    }
    const now = readPurchases(pubkey).find((r) => r.id === record.id);
    if (!now) return "gone";
    if (held) {
      // The key leaves this device's storage. Change still to hand back keeps the record.
      if (now.change) putPurchase(pubkey, letGo(now, "key"));
      else removePurchase(pubkey, now.id);
      return "confirmed";
    }
    // Another write replaced the one that saved it: saved again, from what is there now.
    putPurchase(pubkey, { ...now, savedAt: undefined });
    return "waiting";
  });
}

/** A Cashu token sent with no answer: the key it would make is live (save it), missing (the reader still holds the token), or unknown. */
function checkCashuKey(pubkey: string, record: PendingPurchase, deps: PurchaseDeps): Promise<PollOutcome> {
  return once(pubkey, record, async () => {
    const live = await deps.keyLive({ key: record.key!, url: record.node });
    if (live === "unknown") return "waiting";
    const now = readPurchases(pubkey).find((r) => r.id === record.id);
    if (!now) return "gone";
    if (live === "missing") {
      // A node may still be redeeming a token it went quiet on: only a while later does
      // "no such key" mean it wasn't taken, and the reader still holds the token.
      if (Date.now() - now.createdAt < CASHU_SETTLE_MS) return "waiting";
      removePurchase(pubkey, now.id);
      return "dropped";
    }
    updatePurchase(pubkey, { ...now, unconfirmed: undefined, paid: true });
    return "waiting";
  });
}

/** How long after a Cashu token was sent its key may still appear. */
const CASHU_SETTLE_MS = 10 * 60_000;

/** The key a Cashu token makes on a node: `sk-` + sha256(token), hex (live nodes, 2026-11-13). */
export async function cashuKey(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return `sk-${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * A Cashu token turned into a key, then saved like a bought one. The token itself is never
 * kept; the key it makes (`cashuKey`) is, before the token is sent: if the answer is lost,
 * the poller asks the node whether that key exists. A node that refuses the token leaves
 * nothing behind. `id` names the record, for `changeTaken`.
 */
export async function buyWithCashu(
  { pubkey, node, nodeName, token }: { pubkey: string; node: string; nodeName: string | null; token: string },
  deps: PurchaseDeps = defaultDeps,
): Promise<{ outcome: PollOutcome; change: CashuChange | null; sats: number | null; id: string }> {
  const apiUrl = nodeApiUrl(nodeBase(node));
  const pending: PendingPurchase = {
    id: localId(),
    node: apiUrl,
    nodeName,
    purpose: "create",
    method: "cashu",
    invoiceId: null,
    bolt11: null,
    amountSats: 0,
    expiresAt: null,
    createdAt: Date.now(),
    key: await cashuKey(token),
    unconfirmed: true,
  };
  if (!putPurchase(pubkey, pending)) throw new Error(NOT_KEPT);
  let created: Awaited<ReturnType<typeof createWithCashu>>;
  // While the token is out, the poller leaves the record alone: the key doesn't exist yet.
  const busy = `${pubkey}:${pending.id}`;
  saving.add(busy);
  try {
    created = await createWithCashu(apiUrl, token);
  } catch (err) {
    // Refused (a 4xx): the token wasn't taken, and the reader still holds it. Silence, a
    // 5xx, or a 2xx with no key to read keeps the record: the poller asks whether the key
    // exists, and the record is the only copy of it.
    if (err instanceof RoutstrError && err.failure.status >= 400 && err.failure.status < 500) {
      removePurchase(pubkey, pending.id);
    }
    throw err;
  } finally {
    saving.delete(busy);
  }
  const record: PendingPurchase = {
    ...pending,
    amountSats: created.msats === null ? 0 : msatsToSats(created.msats),
    paid: true,
    unconfirmed: undefined,
    key: created.apiKey,
    ...(created.change ? { change: created.change } : {}),
  };
  putPurchase(pubkey, record);
  const outcome = await saveBought(pubkey, record, deps);
  return { outcome, change: created.change, sats: record.amountSats || null, id: record.id };
}

/**
 * A saved Routstr key's whole balance back as a Cashu token, before the key is removed: kept
 * on this device as change until the reader has taken it (`changeTaken`), so a closed tab
 * doesn't lose it. `id` names that record.
 */
export async function refundToCashu({
  pubkey,
  entry,
  nodeName,
}: {
  pubkey: string;
  entry: AgentKey;
  nodeName: string | null;
}): Promise<{ change: CashuChange; id: string }> {
  const change = await refundKey(entry);
  const record: PendingPurchase = {
    id: localId(),
    node: entry.url,
    nodeName,
    purpose: "topup",
    method: "cashu",
    invoiceId: null,
    bolt11: null,
    amountSats: change.amount ?? 0,
    expiresAt: null,
    createdAt: Date.now(),
    topsUp: keySuffix(entry),
    paid: true,
    change,
  };
  putPurchase(pubkey, record);
  void refreshBalance(entry);
  return { change, id: record.id };
}

/**
 * A Cashu top-up of a saved key. Change the node hands back is kept until the reader takes
 * it; `id` names that record (null with no change), for `changeTaken`.
 */
export async function topUpWithCashu({
  pubkey,
  entry,
  token,
  nodeName,
}: {
  pubkey: string;
  entry: AgentKey;
  token: string;
  nodeName: string | null;
}): Promise<{ sats: number | null; change: CashuChange | null; id: string | null }> {
  const result = await topupWithCashu(entry, token);
  let id: string | null = null;
  if (result.change) {
    id = localId();
    putPurchase(pubkey, {
      id,
      node: entry.url,
      nodeName,
      purpose: "topup",
      method: "cashu",
      invoiceId: null,
      bolt11: null,
      amountSats: result.msats === null ? 0 : msatsToSats(result.msats),
      expiresAt: null,
      createdAt: Date.now(),
      paid: true,
      topsUp: keySuffix(entry),
      change: result.change,
    });
  }
  void refreshBalance(entry);
  return { sats: result.msats === null ? null : msatsToSats(result.msats), change: result.change, id };
}

/** The reader took the change: the record may go (unless a key in it still waits to be saved). */
export function changeTaken(pubkey: string, id: string) {
  const record = readPurchases(pubkey).find((r) => r.id === id);
  if (!record) return;
  if (record.key) putPurchase(pubkey, letGo(record, "change"));
  else removePurchase(pubkey, id);
}

/**
 * The reader forgets an invoice by hand: one that is unpaid, or one that ended (paid here,
 * by the wallet's word, but the node says it expired and has nothing for it), which the
 * screen offers behind a warning. Refused for anything else that may hold money.
 */
export function forgetPurchase(pubkey: string, id: string): boolean {
  const record = readPurchases(pubkey).find((r) => r.id === id);
  if (!record || record.key || record.paid || record.change) return false;
  if (record.paidHere && !record.ended) return false;
  return removePurchase(pubkey, id);
}

// The poller and the live list are their own light module: the app mounts the poller on
// every page (RoutstrPurchaseHost), and it loads this one, with the node's calls, only when
// a purchase is in flight.
export {
  useInvoiceInView,
  usePurchasePoller,
  usePurchases,
  usePurchasesInView,
} from "@/services/routstrPurchasePoller";
