import { useEffect, useMemo, useState } from "react";
import type { NostrEvent } from "nostr-tools";
import { use$ } from "applesauce-react/hooks";
import { matchFilters, type Filter } from "applesauce-core/helpers/filter";
import { eventStore } from "@/lib/eventStore";
import { askOnce, lastAnswer, type AskWindow } from "@/lib/askOnce";

const NONE: NostrEvent[] = [];
const DEFAULT_WINDOW: AskWindow = { minMs: 5 * 60_000 };

/**
 * Events matching `filters`, live from the EventStore, while `ask` fills it.
 *
 * The fetchers `ask` calls add each event to the store as a relay answers, so
 * rows render as they arrive rather than after the slowest relay's EOSE, and
 * our own publishes show at once. Whatever `ask` returns joins the result too —
 * the copies the store did not keep. `key` names the ask: one per key per
 * window, shared by every mount.
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
  const events = useMemo(() => {
    const returned = Array.isArray(answer)
      ? (answer as NostrEvent[])
      : answer && typeof answer === "object" && "kind" in answer && "id" in answer
        ? [answer as NostrEvent]
        : NONE;
    if (!returned.length) return stored;
    const byId = new Map(stored.map((e) => [e.id, e]));
    for (const e of returned) {
      if (e && !byId.has(e.id) && (!filters?.length || matchFilters(filters, e))) byId.set(e.id, e);
    }
    if (byId.size === stored.length) return stored;
    return Array.from(byId.values()).sort((a, b) => b.created_at - a.created_at);
    // filtersKey is `filters`, as a value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored, answer, filtersKey]);

  const done = !!key && settled?.key === key;
  // What was held when this key mounted, kept until its ask settles.
  const atMount = useMemo(() => events, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = stream || done ? events : atMount;
  return { events: shown, loading: !!key && !shown.length && !done, settled: done };
}
