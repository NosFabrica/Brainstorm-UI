/**
 * A Routstr purchase in flight: a Lightning invoice for a new key or a top-up, or a key a
 * Cashu token just bought, from the moment money may move until the key is in the reader's
 * kind 12000. Pure: the record, how one answer from the node moves it on, and where it is
 * kept. `services/routstrPurchase` does the calls.
 *
 * WHY THIS IS IN localStorage. Brainstorm keeps no Nostr data or secrets in browser storage,
 * and this is the one exception, because it is a payment in flight: a tab closed between
 * paying and the key arriving would otherwise lose the reader's money. So, per account,
 * on this device only, never in an event:
 * - it holds the bolt11 and the invoice id, so a reload resumes the poll, and a lost id is
 *   recovered by the bolt11 (`/v2/lightning/recover`);
 * - it holds the bought key only from the moment the node hands it over until the key is
 *   saved to kind 12000 (a failed save keeps it, for Retry);
 * - it is cleared right after that save, or when the invoice expired unpaid.
 * A top-up names its key by the last four characters only: that key is already saved.
 * A Cashu change token the node handed back is kept the same way, until the reader has
 * taken it: it is their money too.
 */
import { accountKey } from "@/lib/accountStorage";
import type { CashuChange } from "@/lib/routstr";

export type PurchasePurpose = "create" | "topup";

export interface PendingPurchase {
  /** Local id: the invoice id, else the payment hash, else a random one. */
  id: string;
  /** The node's NIP-FA URL (`https://<node>/v1`). */
  node: string;
  nodeName: string | null;
  purpose: PurchasePurpose;
  /** `lightning` waits on an invoice; `cashu` was paid with a token in one call. */
  method: "lightning" | "cashu";
  invoiceId: string | null;
  bolt11: string | null;
  amountSats: number;
  /** Unix seconds; null for Cashu. */
  expiresAt: number | null;
  /** When it was made, ms. */
  createdAt: number;
  /** A top-up's key, by its last four characters: never the key itself. */
  topsUp?: string;
  /** The node said paid. A paid purchase is never dropped. */
  paid?: boolean;
  /** This device's wallet said it paid: kept until the node agrees, whatever it says meanwhile. */
  paidHere?: boolean;
  /** A `create`'s key, only until it is saved to kind 12000. Never logged, never shown unasked. */
  key?: string;
  /** Why saving the key failed, for "Retry". */
  saveError?: string;
  /** Change from a Cashu token, until the reader takes it. */
  change?: CashuChange;
  /** The node is reconciling a payment it didn't see settle (`reconciliation_required`). */
  reconciling?: boolean;
}

/** How long a node keeps settling an expired invoice (`INVOICE_EXPIRY_GRACE_SECONDS`, routstr-core). */
export const SETTLEMENT_GRACE_SECONDS = 86_400;

const PAID = new Set(["paid", "completed", "settled", "success"]);
const WAITING = new Set(["pending", "unpaid", "settlement_pending", "open"]);

/** What the node said about an invoice. */
export type NodeAnswer =
  | { type: "status"; status: string; apiKey: string | null }
  /** The node doesn't know the invoice id (404 `invoice_not_found`). */
  | { type: "not-found" }
  /** No answer worth reading: offline, 5xx, garbage. Says nothing about the money. */
  | { type: "unreachable" };

/** What to do next with a record. */
export type Step =
  | { next: "wait"; record: PendingPurchase }
  /** Ask `/v2/lightning/recover` with the bolt11. */
  | { next: "recover"; record: PendingPurchase }
  /** The key is in the record: save it to kind 12000, then clear it. */
  | { next: "save"; record: PendingPurchase }
  /** A paid top-up: nothing left to keep. */
  | { next: "done"; record: PendingPurchase }
  /** Expired unpaid: drop it. */
  | { next: "drop"; record: PendingPurchase };

/**
 * One node answer, applied. `from` says whether it answered the status poll or the
 * recover call: a recover that finds nothing for an invoice that may have been paid is
 * not tried again in a loop, it waits for the next poll.
 *
 * The money rules: a paid purchase is never dropped; a paid `create` with no key keeps
 * recovering, never re-buys; an invoice is dropped only when the node says `expired` and
 * nothing here says it was paid. Silence drops nothing.
 */
export function advance(
  record: PendingPurchase,
  answer: NodeAnswer,
  now: number,
  from: "status" | "recover" = "status",
): Step {
  if (answer.type === "unreachable") return { next: "wait", record };
  if (answer.type === "not-found") {
    // The id is lost (or this node forgot it): the bolt11 still names the payment.
    if (from === "status" && record.bolt11) return { next: "recover", record };
    if (canDrop(record, now)) return { next: "drop", record };
    return { next: "wait", record };
  }
  const status = answer.status.toLowerCase();
  if (PAID.has(status)) {
    const paid = { ...record, paid: true, reconciling: false };
    if (record.purpose === "topup") return { next: "done", record: paid };
    const key = answer.apiKey ?? record.key;
    if (key) return { next: "save", record: { ...paid, key } };
    // Paid, and no key yet: keep asking for it, by the bolt11 once the id has said nothing.
    return from === "status" && record.bolt11 ? { next: "recover", record: paid } : { next: "wait", record: paid };
  }
  if (status === "reconciliation_required") return { next: "wait", record: { ...record, reconciling: true } };
  if (status === "expired" || status === "cancelled" || status === "failed") {
    if (canDrop(record, now)) return { next: "drop", record };
    // The node settles a paid invoice for a day past its expiry: one this wallet paid waits.
    return { next: "wait", record };
  }
  if (WAITING.has(status)) {
    // A node that never moves a dead invoice on: once it can no longer be paid or
    // settled, and nothing says it was, it goes.
    if (record.expiresAt !== null && now > record.expiresAt + SETTLEMENT_GRACE_SECONDS && canDrop(record, now)) {
      return { next: "drop", record };
    }
    return { next: "wait", record };
  }
  return { next: "wait", record };
}

/** Never drop money: only an unpaid, keyless record nothing here paid, past its expiry. */
function canDrop(record: PendingPurchase, now: number): boolean {
  if (record.paid || record.paidHere || record.key || record.change) return false;
  return record.expiresAt !== null && now > record.expiresAt;
}

/** What the reader is shown for a record. */
export type PurchaseState = "awaiting-payment" | "confirming" | "reconciling" | "unsaved-key" | "change" | "expired";

export function purchaseState(record: PendingPurchase, now: number): PurchaseState {
  if (record.key) return "unsaved-key";
  if (record.change && (record.paid || record.method === "cashu")) return "change";
  if (record.reconciling) return "reconciling";
  if (record.paid || record.paidHere) return "confirming";
  if (record.expiresAt !== null && now > record.expiresAt) return "expired";
  return "awaiting-payment";
}

// --- storage ---------------------------------------------------------------------

const storageKey = (pubkey: string) => accountKey("routstr:pending", pubkey);

function valid(r: unknown): r is PendingPurchase {
  const o = r as PendingPurchase | null;
  return (
    !!o &&
    typeof o.id === "string" &&
    typeof o.node === "string" &&
    (o.purpose === "create" || o.purpose === "topup") &&
    (o.method === "lightning" || o.method === "cashu") &&
    typeof o.amountSats === "number"
  );
}

const listeners = new Set<() => void>();
const snapshots = new Map<string, { raw: string | null; list: PendingPurchase[] }>();
const NONE: PendingPurchase[] = [];

/** This account's purchases in flight on this device. Never throws: no storage reads as none. */
export function readPurchases(pubkey: string | null | undefined): PendingPurchase[] {
  if (!pubkey) return NONE;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(storageKey(pubkey));
  } catch {
    return snapshots.get(pubkey)?.list ?? NONE;
  }
  const held = snapshots.get(pubkey);
  if (held && held.raw === raw) return held.list;
  let list: PendingPurchase[] = NONE;
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    list = Array.isArray(parsed) ? parsed.filter(valid) : NONE;
  } catch {
    list = NONE;
  }
  // The same array while storage is unchanged: `useSyncExternalStore` needs a stable snapshot.
  snapshots.set(pubkey, { raw, list });
  return list;
}

/**
 * Writes the whole list. Returns false when storage refused it (private mode, full): the
 * caller must then not move money on the strength of a record that isn't kept.
 */
export function writePurchases(pubkey: string, list: PendingPurchase[]): boolean {
  try {
    if (list.length) localStorage.setItem(storageKey(pubkey), JSON.stringify(list));
    else localStorage.removeItem(storageKey(pubkey));
  } catch {
    return false;
  }
  snapshots.delete(pubkey);
  listeners.forEach((l) => l());
  return true;
}

/** Adds or replaces one record (by id). */
export function putPurchase(pubkey: string, record: PendingPurchase): boolean {
  const list = readPurchases(pubkey).filter((r) => r.id !== record.id);
  return writePurchases(pubkey, [...list, record]);
}

export function removePurchase(pubkey: string, id: string): boolean {
  return writePurchases(
    pubkey,
    readPurchases(pubkey).filter((r) => r.id !== id),
  );
}

export function subscribePurchases(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key.startsWith("routstr:pending:")) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** A local id for a record that has no invoice id (a Cashu purchase). */
export function localId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `local-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
