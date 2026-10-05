/**
 * Follows and mutes the user just toggled, shown before the list is signed and
 * published. Signing can take seconds (a remote signer), and the store only gets
 * the new list once a relay accepts it; this bridges the gap. An edit clears when
 * its publish settles: on success the store holds the real list, on failure the
 * flip simply undoes.
 */
import { useSyncExternalStore } from "react";

export interface ListEdits {
  add: ReadonlySet<string>;
  remove: ReadonlySet<string>;
}

const NONE: ListEdits = { add: new Set(), remove: new Set() };
const edits = new Map<string, ListEdits>();
const listeners = new Set<() => void>();

const keyOf = (kind: number, pubkey: string) => `${kind}:${pubkey}`;
const emit = () => listeners.forEach((l) => l());

function set(key: string, next: ListEdits) {
  if (!next.add.size && !next.remove.size) edits.delete(key);
  else edits.set(key, next);
  emit();
}

/** Show `target` as added to / removed from the list until `publish` settles. */
export async function withListEdit<T>(
  kind: number,
  pubkey: string,
  target: string,
  action: "add" | "remove",
  publish: () => Promise<T>,
): Promise<T> {
  const key = keyOf(kind, pubkey);
  const cur = edits.get(key) ?? NONE;
  const add = new Set(cur.add);
  const remove = new Set(cur.remove);
  (action === "add" ? add : remove).add(target);
  (action === "add" ? remove : add).delete(target);
  set(key, { add, remove });
  try {
    return await publish();
  } finally {
    const now = edits.get(key) ?? NONE;
    const a = new Set(now.add);
    const r = new Set(now.remove);
    (action === "add" ? a : r).delete(target);
    set(key, { add: a, remove: r });
  }
}

/** `base` with this list's pending edits applied. */
export function applyEdits(base: ReadonlySet<string>, e: ListEdits): ReadonlySet<string> {
  if (!e.add.size && !e.remove.size) return base;
  const out = new Set(base);
  e.add.forEach((pk) => out.add(pk));
  e.remove.forEach((pk) => out.delete(pk));
  return out;
}

export function useListEdits(kind: number, pubkey: string | undefined): ListEdits {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (pubkey ? (edits.get(keyOf(kind, pubkey)) ?? NONE) : NONE),
  );
}

/** Test seam. */
export function __resetListEdits(): void {
  edits.clear();
}
