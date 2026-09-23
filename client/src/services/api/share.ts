/**
 * Short links for a profile: minting one and resolving it back.
 */

import { fetch, getBrainstormApi } from "./core";

export const shareApi = {
  // Share links. `/shorturl` is unauthenticated — an anonymous visitor may
  // share a profile — so these use plain fetch, not authenticatedFetch.
  //
  // Idempotent per (pubkey, relay-set): asking twice returns the same code.
  async createShortUrl(pubkey: string, relays: string[]): Promise<string> {
    const response = await fetch(`${getBrainstormApi()}/shorturl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pubkey, relays }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      const err = new Error(`Failed to create short url (${response.status})`) as Error & { status?: number };
      err.status = response.status;
      throw err;
    }
    const body = await response.json(); // { code, message, data: { shortCode, content } }
    const shortCode = body?.data?.shortCode;
    if (!shortCode) throw new Error("Short url response carried no code");
    return shortCode;
  },

  async resolveShortUrl(code: string): Promise<{ pubkey: string; relays: string[] }> {
    const response = await fetch(`${getBrainstormApi()}/shorturl/${encodeURIComponent(code)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      const err = new Error(`Failed to resolve short url (${response.status})`) as Error & { status?: number };
      err.status = response.status;
      throw err;
    }
    const body = await response.json(); // { code, message, data: { pubkey, relays } }
    const pubkey = body?.data?.pubkey;
    if (!pubkey) throw new Error("Short url response carried no pubkey");
    return { pubkey, relays: body?.data?.relays ?? [] };
  },
};
