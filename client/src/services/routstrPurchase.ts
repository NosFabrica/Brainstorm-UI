/**
 * Runs a Routstr purchase from invoice to saved key (lib/routstrPurchase holds the record
 * and the rules). The order is the money's: the record is kept before the invoice is shown
 * (or the Cashu token sent), a key the node hands over is kept before it is saved, and the
 * record goes only once a read of kind 12000 after the save shows the key there.
 *
 * Every write of a record after a call to the node goes over the record as it is then
 * (`updatePurchase`): the wallet, another tab or the reader may have moved it meanwhile.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import { addKey, type AgentKey } from "@/lib/agentKeys";
import { keySuffix } from "@/lib/assistantKeys";
import { msatsToSats, nodeApiUrl, nodeBase, type CashuChange } from "@/lib/routstr";
import {
  advance,
  dropIfDroppable,
  localId,
  putPurchase,
  readPurchases,
  removePurchase,
  subscribePurchases,
  updatePurchase,
  type NodeAnswer,
  type PendingPurchase,
  type PurchasePurpose,
} from "@/lib/routstrPurchase";
import { agentKeysHold, updateAgentKeys } from "@/services/agentKeys";
import {
  RoutstrError,
  createInvoice,
  createWithCashu,
  getBalance,
  invoiceStatus,
  recoverInvoice,
  refreshBalance,
  refreshBalancesAt,
  topupWithCashu,
} from "@/services/routstr";

/** What saving a key came to. `notActive`: another account is signed in now, so nothing was tried. */
export type KeySave = { ok: true } | { ok: false; error?: string; notActive?: boolean };

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
  now: () => number;
}

export const defaultDeps: PurchaseDeps = {
  status: invoiceStatus,
  recover: recoverInvoice,
  saveKey: async (pubkey, entry) => {
    const outcome = await updateAgentKeys((cur) => addKey(cur, entry), { pubkey });
    if (outcome.success) return { ok: true };
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
  now: () => Math.floor(Date.now() / 1000),
};

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
export async function pollPurchase(pubkey: string, id: string, deps: PurchaseDeps = defaultDeps): Promise<PollOutcome> {
  let record = readPurchases(pubkey).find((r) => r.id === id);
  if (!record) return "gone";
  if (record.key) {
    // A Cashu token sent with no answer: its key exists only if the node took it.
    if (record.unconfirmed) return checkCashuKey(pubkey, record, deps);
    // Written: let it go once kind 12000, read again, shows it; write it again if it doesn't.
    if (record.savedAt) return confirmSaved(pubkey, record, deps);
    // A key in hand (a save that failed, a Cashu purchase): save it, ask the node nothing.
    return saveBought(pubkey, record, deps);
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
        return saveBought(pubkey, readPurchases(pubkey).find((r) => r.id === id) ?? step.record, deps);
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

function saveBought(pubkey: string, record: PendingPurchase, deps: PurchaseDeps): Promise<PollOutcome> {
  return once(pubkey, record, async () => {
    const entry: AgentKey = { key: record.key!, url: record.node };
    const saved: KeySave = await deps.saveKey(pubkey, entry).catch(() => ({ ok: false }) as const);
    const now = readPurchases(pubkey).find((r) => r.id === record.id) ?? record;
    // Another account is signed in now (a switch, a sign-out mid-turn): this one's key waits
    // for it, untouched, with no error to stop the poller and nothing to say.
    if (!saved.ok && saved.notActive) return "waiting";
    if (!saved.ok) {
      updatePurchase(pubkey, { ...now, saveError: saved.error ?? "Couldn't save the key." });
      return "unsaved";
    }
    updatePurchase(pubkey, { ...now, saveError: undefined, savedAt: Date.now() });
    return "saved";
  });
}

/** A saved key: the record goes once a read shows it in kind 12000; one a later write undid is saved again. */
function confirmSaved(pubkey: string, record: PendingPurchase, deps: PurchaseDeps): Promise<PollOutcome> {
  return once(pubkey, record, async () => {
    const held = await deps.keyHeld(pubkey, { key: record.key!, url: record.node });
    if (held === null) return "waiting";
    const now = readPurchases(pubkey).find((r) => r.id === record.id);
    if (!now) return "gone";
    if (held) {
      // The key leaves this device's storage. Change still to hand back keeps the record.
      if (now.change) putPurchase(pubkey, { ...now, key: undefined, savedAt: undefined, saveError: undefined });
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
    // Refused (a 4xx): the token wasn't taken, and the reader still holds it. Silence or a
    // 5xx keeps the record: the poller asks whether the key exists.
    if (err instanceof RoutstrError && err.failure.status < 500) removePurchase(pubkey, pending.id);
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
  if (record.key) putPurchase(pubkey, { ...record, change: undefined });
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

/** This account's purchases in flight, live (this tab and others). */
export function usePurchases(pubkey: string | null | undefined): PendingPurchase[] {
  return useSyncExternalStore(subscribePurchases, () => readPurchases(pubkey));
}

const POLL_MS = 3_000;
const SLOW_POLL_MS = 30_000;

/** The records worth a turn: an invoice not yet settled, a key not yet saved or confirmed. */
const isLive = (r: PendingPurchase) =>
  !r.ended && ((r.method === "lightning" && !r.key && !!r.bolt11) || (!!r.key && !r.saveError));

/**
 * One scheduler for the app (module-level): each record has at most one turn out or waiting,
 * and a turn schedules its own next one, so the set of live records changing while a call is
 * out doesn't stop anything. It polls one account, the one the newest mount named
 * (`watching`, with a generation, so an unmount that comes late doesn't stop a newer mount).
 */
const turns = new Map<string, ReturnType<typeof setTimeout> | "running">();
let watching: {
  pubkey: string;
  gen: number;
  onOutcome: { current?: (record: PendingPurchase, outcome: PollOutcome) => void };
} | null = null;
let generation = 0;

const turnKey = (pubkey: string, id: string) => `${pubkey}:${id}`;

function schedule(pubkey: string, id: string, delayMs: number) {
  const key = turnKey(pubkey, id);
  if (turns.has(key)) return;
  turns.set(
    key,
    setTimeout(() => void turn(pubkey, id), delayMs),
  );
}

async function turn(pubkey: string, id: string) {
  const key = turnKey(pubkey, id);
  turns.set(key, "running");
  const record = readPurchases(pubkey).find((r) => r.id === id);
  let outcome: PollOutcome = "gone";
  try {
    outcome = await pollPurchase(pubkey, id);
  } catch {
    outcome = "waiting";
  } finally {
    turns.delete(key);
  }
  const watched = watching?.pubkey === pubkey ? watching : null;
  // Signed out or switched while it ran: nothing to say to the one who is here now.
  if (!watched) return;
  if (record && outcome !== "waiting" && outcome !== "confirmed") watched.onOutcome.current?.(record, outcome);
  // A top-up landed: every balance shown for that node is asked again.
  if (outcome === "topped-up" && record) void refreshBalancesAt(record.node);
  const after = readPurchases(pubkey).find((r) => r.id === id);
  if (!after || !isLive(after)) return;
  const now = Math.floor(Date.now() / 1000);
  const slow =
    after.reconciling ||
    (after.expiresAt !== null && now > after.expiresAt && !after.key) ||
    (!!after.savedAt && Date.now() - after.savedAt > 10_000);
  schedule(pubkey, id, slow ? SLOW_POLL_MS : POLL_MS);
}

/**
 * Keeps every live purchase of this account moving while mounted: every few seconds while
 * one waits to be paid, slower once it is past its expiry, the node is reconciling, or a
 * saved key waits to be seen in kind 12000. Mounted once for the app, so a purchase resumes
 * after a reload wherever the reader lands.
 */
export function usePurchasePoller(
  pubkey: string | null | undefined,
  onOutcome?: (record: PendingPurchase, outcome: PollOutcome) => void,
) {
  const callback = useRef(onOutcome);
  callback.current = onOutcome;
  const purchases = usePurchases(pubkey);
  // Sorted: the same set is the same value, whatever order storage holds it in.
  const ids = purchases
    .filter(isLive)
    .map((r) => r.id)
    .sort()
    .join(",");

  useEffect(() => {
    if (!pubkey) return;
    const gen = ++generation;
    watching = { pubkey, gen, onOutcome: callback };
    return () => {
      if (watching?.gen !== gen) return;
      watching = null;
      // Waiting turns of this account go; one out finishes and, unwatched, stops there.
      for (const [key, timer] of turns) {
        if (key.startsWith(`${pubkey}:`) && timer !== "running") {
          clearTimeout(timer);
          turns.delete(key);
        }
      }
    };
  }, [pubkey]);

  useEffect(() => {
    if (!pubkey || !ids) return;
    // Only records with no turn out or waiting: the others keep their own pace.
    for (const id of ids.split(",")) schedule(pubkey, id, 0);
  }, [pubkey, ids]);
}
