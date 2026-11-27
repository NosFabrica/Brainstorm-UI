/**
 * Replaceable or addressable events held by address for a while, for a reader that asks for the
 * same few many times (every note carrying a tag points at the same tagging header).
 *
 * - The newest version wins (NIP-01: newer `created_at`, on a tie the lower id), whatever order
 *   relays answer in: a lagging relay's older copy never replaces a newer one.
 * - An entry is fresh for `ttlMs` after a relay last answered for it; after that a reader asks
 *   again, and can still fall back on the held version if nothing answers.
 * - At most `cap` addresses: past it, the least recently answered go first.
 */
import { beats } from "./newestPerAddress";

type Ev = { id: string; pubkey: string; kind: number; created_at: number; tags: string[][] };

export class AddressCache<E extends Ev> {
  private readonly entries = new Map<string, { event: E; at: number }>();
  private readonly ttlMs: number;
  private readonly cap: number;

  constructor({ ttlMs, cap }: { ttlMs: number; cap: number }) {
    this.ttlMs = ttlMs;
    this.cap = cap;
  }

  /** A relay answered with `event` for `address`: keep the newer of it and what is held. Returns the one kept. */
  hold(address: string, event: E): E {
    const held = this.entries.get(address)?.event;
    const kept = held && !beats(event, held) ? held : event;
    // Re-inserted, so the Map's order is the order addresses were last answered for.
    this.entries.delete(address);
    this.entries.set(address, { event: kept, at: Date.now() });
    while (this.entries.size > this.cap) this.entries.delete(this.entries.keys().next().value as string);
    return kept;
  }

  /** The held version, while a relay answered for it recently enough. */
  fresh(address: string): E | undefined {
    const entry = this.entries.get(address);
    return entry && Date.now() - entry.at <= this.ttlMs ? entry.event : undefined;
  }

  /** The held version, however old. */
  held(address: string): E | undefined {
    return this.entries.get(address)?.event;
  }

  clear(): void {
    this.entries.clear();
  }
}
