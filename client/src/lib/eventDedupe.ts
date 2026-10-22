/**
 * One event, once, where a feed's list item (kind 39999, lib/calendarEvent
 * EVENT_ITEM_KIND) and an aggregator's NIP-52 copy both describe it. An item
 * names its copies (`a … copy`), and those go; two curators' items for the
 * same page (the same `i`) go to one; a copy no item names goes when it
 * starts within 15 minutes of an item and reads the same. An organizer's own
 * NIP-52 event never meets an item — Event Index makes none for those — and
 * two NIP-52 events are never each other's copy here: only an item decides.
 */
import { EVENT_ITEM_KIND, parseCalendarEvent } from "@/lib/calendarEvent";

type EventLike = { id: string; kind: number; pubkey: string; content: string; tags: string[][] };

const NEAR_SEC = 15 * 60;

const address = (e: EventLike) => `${e.kind}:${e.pubkey}:${e.tags.find((t) => t[0] === "d")?.[1] ?? ""}`;
const plain = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\b(and|the|a|an|of|at|in)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function dedupeEvents<T extends EventLike>(events: readonly T[]): T[] {
  const items = events.filter((e) => e.kind === EVENT_ITEM_KIND);
  if (items.length === 0) return [...events];
  // The copies the items name, by address.
  const named = new Set<string>();
  for (const it of items) for (const t of it.tags) if (t[0] === "a" && t[3] === "copy" && t[1]) named.add(t[1]);
  // The items' starts and titles, for the copies nobody named.
  const seen = items.map((it) => {
    const p = parseCalendarEvent(it as never);
    return { startSec: p.startSec, title: plain(p.title) };
  });
  const readsLikeAnItem = (e: T) => {
    const p = parseCalendarEvent(e as never);
    const title = plain(p.title);
    return seen.some((s) => Math.abs(s.startSec - p.startSec) <= NEAR_SEC && s.title === title);
  };
  const pages = new Set<string>();
  const out: T[] = [];
  for (const e of events) {
    if (e.kind === EVENT_ITEM_KIND) {
      const page = e.tags.find((t) => t[0] === "i")?.[1];
      if (page) {
        if (pages.has(page)) continue;
        pages.add(page);
      }
      out.push(e);
      continue;
    }
    if (named.has(address(e)) || readsLikeAnItem(e)) continue;
    out.push(e);
  }
  return out;
}
