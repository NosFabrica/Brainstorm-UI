/**
 * A person's Blossom servers (BUD-03, kind 10063): where they keep their files,
 * most preferred first. Private-message attachments go there before anywhere else.
 */
import type { NostrEvent } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import { loadReplaceable } from "@/lib/loaders";
import { PROFILE_RELAYS } from "@/lib/relays";
import { outboxRelays } from "@/lib/relayRouting";

export const BLOSSOM_SERVER_LIST_KIND = 10063;

/**
 * Where encrypted attachments go when a person's own servers won't take them, and
 * what we suggest to someone with no list. Most servers accept only media they can
 * recognise and refuse ciphertext (application/octet-stream) with 415 — Primal,
 * nostr.build/blossom.band, nostrcheck and 24242.io all did (2026-10-01). These took
 * it, from a browser, and served the same bytes back.
 */
export const ENCRYPTED_BLOSSOM_SERVERS = ["https://nostr.download", "https://blossom.yakihonne.com"];

/** A server address as kept and compared: https, no trailing slash; null if it isn't one. */
export function normalizeServer(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

function dedupe(urls: Iterable<string>): string[] {
  const out: string[] = [];
  for (const raw of urls) {
    const url = normalizeServer(raw);
    if (url && !out.includes(url)) out.push(url);
  }
  return out;
}

/** The servers a kind-10063 names, in its order. */
export function parseBlossomServers(event: Pick<NostrEvent, "tags"> | undefined | null): string[] {
  if (!event) return [];
  return dedupe(event.tags.filter((t) => t[0] === "server" && t[1]).map((t) => t[1]));
}

/** The tags for a kind-10063 naming `servers`. */
export function blossomServerTags(servers: string[]): string[][] {
  return dedupe(servers).map((url) => ["server", url]);
}

/** Where to try an encrypted upload: their own servers first, then ones known to take ciphertext. */
export function encryptedUploadServers(own: string[]): string[] {
  return dedupe([...own, ...ENCRYPTED_BLOSSOM_SERVERS]);
}

export interface BlossomServerLookup {
  servers: string[];
  /** Their list was found (it may still name nothing usable). */
  found: boolean;
}

/** Someone's Blossom servers: from the store if held (unless `fresh`), else from their outbox relays. */
export async function loadBlossomServers(
  pubkey: string,
  { timeoutMs = 4000, fresh = false }: { timeoutMs?: number; fresh?: boolean } = {},
): Promise<BlossomServerLookup> {
  if (!fresh) {
    const held = eventStore.getReplaceable(BLOSSOM_SERVER_LIST_KIND, pubkey) as NostrEvent | undefined;
    if (held) return { servers: parseBlossomServers(held), found: true };
  }
  const where = await outboxRelays(pubkey, PROFILE_RELAYS, { timeoutMs: Math.min(timeoutMs, 2500) }).catch(
    () => PROFILE_RELAYS,
  );
  const event = await loadReplaceable(BLOSSOM_SERVER_LIST_KIND, pubkey, {
    relays: where,
    timeoutMs,
    fromRelays: fresh,
  });
  const held = event ?? (eventStore.getReplaceable(BLOSSOM_SERVER_LIST_KIND, pubkey) as NostrEvent | undefined);
  return { servers: parseBlossomServers(held), found: !!held };
}
