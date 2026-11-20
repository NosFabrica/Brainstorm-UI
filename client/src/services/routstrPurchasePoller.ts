/**
 * The Routstr purchase poller and the live list of purchases: what the app mounts on every
 * page (`RoutstrPurchaseHost`). Light on purpose: the node's calls and the kind 12000 saves
 * (`services/routstrPurchase`, `services/routstr`) are loaded on a purchase's first turn, so a
 * visitor with nothing in flight never downloads them.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { readPurchases, subscribePurchases, type PendingPurchase } from "@/lib/routstrPurchase";
import type { PollOutcome } from "@/services/routstrPurchase";

/** This account's purchases in flight, live (this tab and others). */
export function usePurchases(pubkey: string | null | undefined): PendingPurchase[] {
  return useSyncExternalStore(subscribePurchases, () => readPurchases(pubkey));
}

// From the background: a turn that would prompt the signer waits for a page that shows it.
const pollPurchase = async (pubkey: string, id: string) =>
  (await import("@/services/routstrPurchase")).pollPurchase(pubkey, id, undefined, { background: true });
const refreshBalancesAt = async (node: string) => (await import("@/services/routstr")).refreshBalancesAt(node);

// --- what the reader is looking at ---------------------------------------------------

/** Invoices on screen now (their ids): each is asked about every few seconds. */
const invoicesInView = new Set<string>();
/** Screens showing purchases (the AI model page): the reader expects a signer to ask there. */
let screensInView = 0;

/** Whether a screen showing this account's purchases is open: a save may ask the signer then. */
export function purchasesInView(): boolean {
  return screensInView > 0 || invoicesInView.size > 0;
}

/** Mounted by a screen that shows purchases (the AI model page's list). */
export function usePurchasesInView() {
  useEffect(() => {
    screensInView++;
    return () => {
      screensInView--;
    };
  }, []);
}

/** Mounted by the invoice while it is on screen: that one is asked about fast, starting now. */
export function useInvoiceInView(pubkey: string | null | undefined, id: string) {
  useEffect(() => {
    if (!pubkey) return;
    invoicesInView.add(id);
    hurry(pubkey, id);
    return () => {
      invoicesInView.delete(id);
    };
  }, [pubkey, id]);
}

// --- pacing --------------------------------------------------------------------------

/** An invoice on screen, or one this device's wallet paid (or is paying). */
const FAST_MS = 3_000;
const MINUTE = 60_000;

/**
 * How long until a record's next turn. Fast only while it is on screen or this device paid
 * it (the key is on its way); an unpaid invoice nobody is looking at, every ten seconds and
 * slower as it ages; past its expiry (the node may still settle it for a day) every two
 * minutes; a node reconciling, or a saved key waiting to be read back, every thirty seconds.
 */
export function nextTurnIn(r: PendingPurchase, nowMs: number): number {
  const paying = !!r.paidHere || !!r.payAttempted;
  if (r.key) return r.savedAt && nowMs - r.savedAt > 10_000 ? 30_000 : 10_000;
  if (r.reconciling) return 30_000;
  if (r.expiresAt !== null && nowMs / 1000 > r.expiresAt) return paying ? 30_000 : 2 * MINUTE;
  if (invoicesInView.has(r.id) || paying) return FAST_MS;
  const age = nowMs - r.createdAt;
  return age < 10 * MINUTE ? 10_000 : age < 30 * MINUTE ? 30_000 : MINUTE;
}

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
  if (!after || !isLive(after) || !polls(id)) return;
  schedule(pubkey, id, nextTurnIn(after, Date.now()));
}

/** An invoice just came on screen: its waiting turn, if any, is brought forward. */
function hurry(pubkey: string, id: string) {
  if (watching?.pubkey !== pubkey) return;
  const key = turnKey(pubkey, id);
  const timer = turns.get(key);
  if (timer === "running") return;
  if (timer !== undefined) clearTimeout(timer);
  turns.delete(key);
  const record = readPurchases(pubkey).find((r) => r.id === id);
  if (record && isLive(record)) schedule(pubkey, id, 0);
}

// --- one tab polls -------------------------------------------------------------------

/**
 * Whether this tab polls: the one holding the account's lock (`navigator.locks`), so open tabs
 * don't each ask the node and save the same key. Where the browser has no locks, every tab
 * does, as before. Another tab still asks about an invoice it shows.
 */
let leader = true;
const polls = (id: string) => leader || invoicesInView.has(id);

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

  // One tab polls each account: the first to take the lock; the next takes over when it closes.
  const [elected, setElected] = useState(() => !hasLocks());
  useEffect(() => {
    if (!pubkey || !hasLocks()) return;
    setElected(false);
    const stop = new AbortController();
    navigator.locks
      .request(`routstr-purchases:${pubkey}`, { signal: stop.signal }, () => {
        setElected(true);
        // Held until this tab stops polling this account.
        return new Promise<void>((release) => stop.signal.addEventListener("abort", () => release(), { once: true }));
      })
      .catch(() => undefined);
    return () => stop.abort();
  }, [pubkey]);
  leader = elected;

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
    for (const id of ids.split(",")) if (polls(id)) schedule(pubkey, id, 0);
  }, [pubkey, ids, elected]);
}

const hasLocks = () => typeof navigator !== "undefined" && !!navigator.locks?.request;
