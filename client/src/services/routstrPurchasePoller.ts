/**
 * The Routstr purchase poller and the live list of purchases: what the app mounts on every
 * page (`RoutstrPurchaseHost`). Light on purpose: the node's calls and the kind 12000 saves
 * (`services/routstrPurchase`, `services/routstr`) are loaded on a purchase's first turn, so a
 * visitor with nothing in flight never downloads them.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import { readPurchases, subscribePurchases, type PendingPurchase } from "@/lib/routstrPurchase";
import type { PollOutcome } from "@/services/routstrPurchase";

/** This account's purchases in flight, live (this tab and others). */
export function usePurchases(pubkey: string | null | undefined): PendingPurchase[] {
  return useSyncExternalStore(subscribePurchases, () => readPurchases(pubkey));
}

const pollPurchase = async (pubkey: string, id: string) =>
  (await import("@/services/routstrPurchase")).pollPurchase(pubkey, id);
const refreshBalancesAt = async (node: string) => (await import("@/services/routstr")).refreshBalancesAt(node);

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
