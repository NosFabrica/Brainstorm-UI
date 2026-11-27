import { nip19 } from "nostr-tools";
import type { NostrSearchResult } from "@/services/nostr";

/**
 * A pasted list of npubs or hex pubkeys (one per line or comma-separated) as
 * onboard-queue entries: each key once, none already `queued`; anything that
 * isn't a key comes back in `errors`, cut to 20 characters.
 */
export function parseNpubList(
  input: string,
  queued: readonly { pubkey: string }[],
): { added: NostrSearchResult[]; errors: string[] } {
  const lines = input
    .split(/[\n,]+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const added: NostrSearchResult[] = [];
  const errors: string[] = [];
  for (const line of lines) {
    let hex = line;
    if (line.startsWith("npub")) {
      try {
        const decoded = nip19.decode(line);
        if (decoded.type === "npub") hex = decoded.data;
        else {
          errors.push(line.slice(0, 20) + "...");
          continue;
        }
      } catch {
        errors.push(line.slice(0, 20) + "...");
        continue;
      }
    } else if (!/^[0-9a-fA-F]{64}$/.test(line)) {
      errors.push(line.slice(0, 20) + "...");
      continue;
    }
    hex = hex.toLowerCase();
    if (!added.some((p) => p.pubkey === hex) && !queued.some((p) => p.pubkey === hex)) {
      added.push({ pubkey: hex, npub: nip19.npubEncode(hex) });
    }
  }
  return { added, errors };
}
