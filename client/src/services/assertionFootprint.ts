/**
 * What a designated trust provider is actually doing: how many people it
 * holds kind-30382 assertions for, and when it last published. A
 * designation's page shows this — the payoff of pointing readers at a
 * relay is that the relay is live and working.
 *
 * scores.brainstorm.world answers no COUNT (probed 2026-09-23), so the count
 * is a bounded read: up to the cap, and "cap+" beyond it. Newest first is
 * the relay's default order, so the first event carries the freshness.
 */
import type { NostrEvent } from "nostr-tools";
import { pool } from "@/lib/relayPool";

export const FOOTPRINT_CAP = 200;

export interface AssertionFootprint {
  /** People the provider holds an assertion for — the cap when capped. */
  people: number;
  capped: boolean;
  /** When the provider last published, epoch seconds. */
  updatedAt: number;
}

export function fetchAssertionFootprint(providerPubkey: string, relayUrl: string, timeoutMs = 6000): Promise<AssertionFootprint | null> {
  return new Promise((resolve) => {
    let people = 0;
    let updatedAt = 0;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sub.unsubscribe();
      resolve(people === 0 ? null : { people, capped: people >= FOOTPRINT_CAP, updatedAt });
    };
    const timer = setTimeout(finish, timeoutMs);
    const sub = pool
      .relay(relayUrl)
      .req({ kinds: [30382], authors: [providerPubkey], limit: FOOTPRINT_CAP })
      .subscribe({
        next: (msg: { type: string; event?: NostrEvent }) => {
          if (msg.type === "EVENT" && msg.event) {
            people++;
            if (msg.event.created_at > updatedAt) updatedAt = msg.event.created_at;
          } else if (msg.type === "EOSE" || msg.type === "CLOSED") {
            finish();
          }
        },
        error: finish,
      });
  });
}
