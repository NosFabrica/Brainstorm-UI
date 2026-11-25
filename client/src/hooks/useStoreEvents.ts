import { useEffect, useMemo, useState } from "react";
import type { NostrEvent } from "nostr-tools";
import { use$ } from "applesauce-react/hooks";
import { matchFilters, type Filter } from "applesauce-core/helpers/filter";
import { getExpirationTimestamp } from "applesauce-core/helpers/expiration";
import { unixNow } from "applesauce-core/helpers/time";
import { eventStore } from "@/lib/eventStore";
import { askOnce, lastAnswer, type AskWindow } from "@/lib/askOnce";

const NONE: NostrEvent[] = [];

/** The events an ask answered, whatever its shape: a list, one event, or something else (none). */
function answeredEvents(answer: unknown): NostrEvent[] {
  if (Array.isArray(answer)) return answer as NostrEvent[];
  if (answer && typeof answer === "object" && "kind" in answer && "id" in answer) return [answer as NostrEvent];
  return NONE;
}

/**
 * An answer the store would let in. One it holds is taken as the store has it;
 * one it doesn't (pruned) must not be deleted or expired. The fetchers hand
 * back what `eventStore.add` answered, and the store answers null for a copy
 * it refuses (lib/eventStore), so a bad signature never gets this far.
 */
function trustedAnswers(answer: unknown): NostrEvent[] {
  const all = answeredEvents(answer);
  if (!all.length) return NONE;
  const out: NostrEvent[] = [];
  for (const e of all) {
    if (!e || typeof e.id !== "string") continue;
    const held = eventStore.getEvent(e.id);
    if (held) out.push(held);
    else if (stillKept(e)) out.push(e);
  }
  return out;
}

/** Not deleted by its author, not expired, and (if the store took it) not since removed. */
function stillKept(e: NostrEvent): boolean {
  if (eventStore.deletes.check(e)) return false;
  const expires = getExpirationTimestamp(e);
  return !expires || expires > unixNow();
}
const DEFAULT_WINDOW: AskWindow = { minMs: 5 * 60_000 };

/**
 * Events matching `filters`, live from the EventStore, while `ask` fills it.
 *
 * The fetchers `ask` calls add each event to the store as a relay answers, so
 * rows render as they arrive rather than after the slowest relay's EOSE, and
 * our own publishes show at once. Whatever `ask` returns joins the result too —
 * the copies the store did not keep (pruned ones) — but only what the store
 * would let in: never a copy it refused for its signature, never one its
 * author has deleted, and not one the store has since removed. `key` names
 * the ask: one per key per window, shared by every mount.
 *
 * `stream: false` shows what the store held at mount until that ask settles,
 * then the store live: for lists other asks key on (a note's tags, a pin), so
 * they ask once rather than once per arriving event.
 *
 * `loading` is true only while nothing matches and the first ask is out;
 * `settled` once that ask has finished. Asks keyed on these events (their
 * parents, their reactions) wait for `settled`: a key that changes with every
 * arriving event would be a REQ per event.
 */
export function useStoreEvents(
  key: string | null,
  filters: Filter[] | null,
  ask: () => Promise<unknown>,
  { stream = true, ...window }: AskWindow & { stream?: boolean } = DEFAULT_WINDOW,
): { events: NostrEvent[]; loading: boolean; settled: boolean } {
  const filtersKey = filters ? JSON.stringify(filters) : "";
  const stored = use$(() => (filters?.length ? eventStore.timeline(filters) : undefined), [filtersKey]) ?? NONE;
  const [settled, setSettled] = useState<{ key: string; answer: unknown }>();

  useEffect(() => {
    if (!key) return;
    let alive = true;
    const done = () => {
      if (alive) setSettled({ key, answer: lastAnswer(key) });
    };
    const pending = askOnce(key, window, () => ask());
    if (pending) pending.then(done, done);
    else done();
    return () => {
      alive = false;
    };
    // `key` names the ask and its inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const answer = settled?.key === key ? settled.answer : key ? lastAnswer(key) : undefined;
  // What the ask returned, as the store would have it: its own copy where it
  // holds one, and nothing it refused (a bad signature, a deleted event).
  const returned = useMemo(() => trustedAnswers(answer), [answer]);
  // A deletion (or a removal) landing after the answer takes the event off screen.
  const [gone, setGone] = useState<{ from: NostrEvent[]; ids: ReadonlySet<string> }>();
  useEffect(() => {
    if (!returned.length) return;
    const ids = new Set(returned.map((e) => e.id));
    const drop = (id: string) =>
      setGone((prev) => {
        const kept = prev?.from === returned ? prev.ids : new Set<string>();
        return { from: returned, ids: new Set(kept).add(id) };
      });
    const removed = eventStore.remove$.subscribe((e) => ids.has(e.id) && drop(e.id));
    const deleted = eventStore.deletes.deleted$.subscribe(() => {
      for (const e of returned) if (eventStore.deletes.check(e)) drop(e.id);
    });
    return () => {
      removed.unsubscribe();
      deleted.unsubscribe();
    };
  }, [returned]);
  const goneIds = gone?.from === returned ? gone.ids : undefined;
  const events = useMemo(() => {
    if (!returned.length) return stored;
    const byId = new Map(stored.map((e) => [e.id, e]));
    for (const e of returned) {
      if (byId.has(e.id) || goneIds?.has(e.id) || !stillKept(e)) continue;
      if (!filters?.length || matchFilters(filters, e)) byId.set(e.id, e);
    }
    if (byId.size === stored.length) return stored;
    return Array.from(byId.values()).sort((a, b) => b.created_at - a.created_at);
    // filtersKey is `filters`, as a value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored, returned, filtersKey, goneIds]);

  const done = !!key && settled?.key === key;
  // What was held when this key mounted, kept until its ask settles.
  const atMount = useMemo(() => events, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = stream || done ? events : atMount;
  return { events: shown, loading: !!key && !shown.length && !done, settled: done };
}
