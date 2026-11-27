import { DmStore } from "@/lib/dm/store";
import type { Clock } from "./clock";

/**
 * What the DM engine's parts share: the account, the store, the clock, which
 * wraps are already accounted for, and the one `stopped` flag. Only
 * `DmEngine.stop` sets it; every part reads it before acting.
 */
export class DmCore {
  /** Set once, by `DmEngine.stop`: nothing acts, writes or schedules after it. */
  stopped = false;
  readonly store: DmStore;
  /** Wrap ids already opened (or given up on). */
  readonly seen = new Set<string>();
  /** wrap id → message id, to merge relays when the same wrap arrives again. */
  readonly wrapToMessage = new Map<string, string>();

  constructor(
    readonly me: string,
    readonly clock: Clock,
    /** Whether the device has a connection (navigator.onLine). */
    readonly online: () => boolean,
    /** Something the engine's state shows changed (coalesced by the engine). */
    readonly changed: () => void,
  ) {
    this.store = new DmStore(me);
  }

  now(): number {
    return this.clock.now();
  }
}
