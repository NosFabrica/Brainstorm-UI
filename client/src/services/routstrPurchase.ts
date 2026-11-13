/**
 * Runs a Routstr purchase from invoice to saved key (lib/routstrPurchase holds the record
 * and the rules). The order is the money's: the record is kept before the invoice is shown,
 * a key the node hands over is kept before it is saved, and the record goes only once the
 * key is in kind 12000.
 */
import { useEffect, useSyncExternalStore } from "react";
import { addKey, type AgentKey } from "@/lib/agentKeys";
import { keySuffix } from "@/lib/assistantKeys";
import { msatsToSats, nodeApiUrl, nodeBase, type CashuChange } from "@/lib/routstr";
import {
  advance,
  localId,
  putPurchase,
  readPurchases,
  removePurchase,
  subscribePurchases,
  type NodeAnswer,
  type PendingPurchase,
  type PurchasePurpose,
} from "@/lib/routstrPurchase";
import { updateAgentKeys } from "@/services/agentKeys";
import {
  createInvoice,
  createWithCashu,
  invoiceStatus,
  markRoutstr,
  recoverInvoice,
  refreshBalance,
  refreshBalancesAt,
  topupWithCashu,
} from "@/services/routstr";

/** What the driver calls, so tests (and nothing else) can stand in for the node and the signer. */
export interface PurchaseDeps {
  status: (apiUrl: string, invoiceId: string) => Promise<NodeAnswer>;
  recover: (apiUrl: string, bolt11: string) => Promise<NodeAnswer>;
  /** Saves `entry` into the reader's kind 12000; resolves with whether it was saved. */
  saveKey: (entry: AgentKey) => Promise<{ ok: boolean; error?: string }>;
  now: () => number;
}

export const defaultDeps: PurchaseDeps = {
  status: invoiceStatus,
  recover: recoverInvoice,
  saveKey: async (entry) => {
    const outcome = await updateAgentKeys((cur) => addKey(cur, entry));
    return outcome.success ? { ok: true } : { ok: false, error: outcome.error ?? "Couldn't save the key." };
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
  if (record) putPurchase(pubkey, { ...record, paidHere: true });
}

export type PollOutcome = "waiting" | "saved" | "unsaved" | "topped-up" | "dropped" | "gone";

/**
 * One turn of the machine for one record: ask the node (by id, else by the bolt11), apply
 * the answer, and save a key the moment one arrives. The record on disk is updated before
 * anything that could fail, so a reload at any point resumes from where this left off.
 */
export async function pollPurchase(pubkey: string, id: string, deps: PurchaseDeps = defaultDeps): Promise<PollOutcome> {
  let record = readPurchases(pubkey).find((r) => r.id === id);
  if (!record) return "gone";
  // A key already in hand (a save that failed, a Cashu purchase): save it, ask nothing.
  if (record.key) return saveBought(pubkey, record, deps);
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
      putPurchase(pubkey, record);
      answer = await deps.recover(record.node, record.bolt11!);
      from = "recover";
      continue;
    }
    switch (step.next) {
      case "wait":
      case "recover":
        putPurchase(pubkey, step.record);
        return "waiting";
      case "drop":
        removePurchase(pubkey, record.id);
        return "dropped";
      case "done":
        removePurchase(pubkey, record.id);
        return "topped-up";
      case "save":
        // Kept first: the key is the reader's money, and the save below may fail or the tab close.
        putPurchase(pubkey, step.record);
        return saveBought(pubkey, step.record, deps);
    }
  }
  return "waiting";
}

/** Records whose key is being saved now: a second save (the poller beside the screen) waits. */
const saving = new Set<string>();

async function saveBought(pubkey: string, record: PendingPurchase, deps: PurchaseDeps): Promise<PollOutcome> {
  const key = record.key!;
  const entry: AgentKey = { key, url: record.node };
  const id = `${pubkey}:${record.id}`;
  if (saving.has(id)) return "waiting";
  saving.add(id);
  const saved = await deps
    .saveKey(entry)
    .catch(() => ({ ok: false, error: "Couldn't save the key." }))
    .finally(() => saving.delete(id));
  if (!saved.ok) {
    putPurchase(pubkey, { ...record, saveError: saved.error ?? "Couldn't save the key." });
    return "unsaved";
  }
  markRoutstr(record.node);
  // Saved: the key leaves this device's storage. Change still to hand back keeps the record.
  if (record.change) putPurchase(pubkey, { ...record, key: undefined, saveError: undefined });
  else removePurchase(pubkey, record.id);
  return "saved";
}

/**
 * A Cashu token turned into a key, then saved like a bought one. The token itself is
 * never kept: the call either answers with the key (kept until saved) or the reader still
 * holds the token, and sending it again gives back the same key.
 */
export async function buyWithCashu(
  { pubkey, node, nodeName, token }: { pubkey: string; node: string; nodeName: string | null; token: string },
  deps: PurchaseDeps = defaultDeps,
): Promise<{ outcome: PollOutcome; change: CashuChange | null; sats: number | null }> {
  const apiUrl = nodeApiUrl(nodeBase(node));
  const created = await createWithCashu(apiUrl, token);
  const record: PendingPurchase = {
    id: localId(),
    node: apiUrl,
    nodeName,
    purpose: "create",
    method: "cashu",
    invoiceId: null,
    bolt11: null,
    amountSats: created.msats === null ? 0 : msatsToSats(created.msats),
    expiresAt: null,
    createdAt: Date.now(),
    paid: true,
    key: created.apiKey,
    ...(created.change ? { change: created.change } : {}),
  };
  putPurchase(pubkey, record);
  const outcome = await saveBought(pubkey, record, deps);
  return { outcome, change: created.change, sats: record.amountSats || null };
}

/** A Cashu top-up of a saved key. Change the node hands back is kept until the reader takes it. */
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
}): Promise<{ sats: number | null; change: CashuChange | null }> {
  const result = await topupWithCashu(entry, token);
  if (result.change) {
    putPurchase(pubkey, {
      id: localId(),
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
  return { sats: result.msats === null ? null : msatsToSats(result.msats), change: result.change };
}

/** The reader took the change: the record may go (unless a key in it still waits to be saved). */
export function changeTaken(pubkey: string, id: string) {
  const record = readPurchases(pubkey).find((r) => r.id === id);
  if (!record) return;
  if (record.key) putPurchase(pubkey, { ...record, change: undefined });
  else removePurchase(pubkey, id);
}

/** The reader forgets an unpaid invoice by hand. Refused for anything that may hold money. */
export function forgetPurchase(pubkey: string, id: string): boolean {
  const record = readPurchases(pubkey).find((r) => r.id === id);
  if (!record || record.key || record.paid || record.paidHere || record.change) return false;
  return removePurchase(pubkey, id);
}

/** This account's purchases in flight, live (this tab and others). */
export function usePurchases(pubkey: string | null | undefined): PendingPurchase[] {
  return useSyncExternalStore(subscribePurchases, () => readPurchases(pubkey));
}

const POLL_MS = 3_000;
const SLOW_POLL_MS = 30_000;
const polling = new Map<string, boolean>();

/**
 * Keeps every Lightning purchase of this account moving while mounted: every few seconds
 * while one waits to be paid, slower once it is past its expiry or the node is reconciling.
 * Mounted once for the app, so a purchase resumes after a reload wherever the reader lands.
 */
export function usePurchasePoller(
  pubkey: string | null | undefined,
  onOutcome?: (record: PendingPurchase, outcome: PollOutcome) => void,
) {
  const purchases = usePurchases(pubkey);
  const live = purchases.filter((r) => (r.method === "lightning" && !r.key) || (r.key && !r.saveError));
  const ids = live.map((r) => r.id).join(",");
  useEffect(() => {
    if (!pubkey || !ids) return;
    let stopped = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const tick = async (id: string) => {
      const pollKey = `${pubkey}:${id}`;
      if (stopped || polling.get(pollKey)) return;
      polling.set(pollKey, true);
      const record = readPurchases(pubkey).find((r) => r.id === id);
      let outcome: PollOutcome = "gone";
      try {
        outcome = await pollPurchase(pubkey, id);
      } finally {
        polling.delete(pollKey);
      }
      if (record && outcome !== "waiting") onOutcome?.(record, outcome);
      // A top-up landed: every balance shown for that node is asked again.
      if (outcome === "topped-up" && record) void refreshBalancesAt(record.node);
      if (stopped || outcome !== "waiting") return;
      const now = Math.floor(Date.now() / 1000);
      const after = readPurchases(pubkey).find((r) => r.id === id);
      const slow = !!after && (after.reconciling || (after.expiresAt !== null && now > after.expiresAt));
      timers.push(setTimeout(() => void tick(id), slow ? SLOW_POLL_MS : POLL_MS));
    };
    for (const id of ids.split(",")) void tick(id);
    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
    };
    // `ids` is the live set, as a value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkey, ids]);
}
