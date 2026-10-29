/**
 * Short links: minting a code for a shareable entity and resolving it back.
 */

import { fetch, getBrainstormApi } from "./core";

/** What a code can stand for; the server validates each kind's key. */
export type ShortLinkKind = "profile" | "event" | "address" | "hashtag" | "tag";

export interface ShortLinkEntity {
  kind: ShortLinkKind;
  key: string;
  /** Stored only on the first mint for this entity; later mints never change them. */
  relays?: string[];
}

export interface ResolvedShortLink {
  kind: ShortLinkKind;
  key: string;
  relays: string[];
  /** The full on-site link, built by the server. */
  path: string;
}

export interface MintedShortLink extends ResolvedShortLink {
  shortCode: string;
}

function failure(response: Response, what: string): never {
  const err = new Error(`Failed to ${what} short url (${response.status})`) as Error & { status?: number };
  err.status = response.status;
  throw err;
}

function readLink(data: Record<string, unknown> | undefined): ResolvedShortLink {
  if (!data?.path || !data.kind || !data.key) throw new Error("Short url response carried no entity");
  return {
    kind: data.kind as ShortLinkKind,
    key: data.key as string,
    relays: (data.relays as string[] | undefined) ?? [],
    path: data.path as string,
  };
}

export const shareApi = {
  // Unauthenticated (anonymous visitors share too); idempotent per (kind, key).
  async createShortUrl({ kind, key, relays }: ShortLinkEntity): Promise<MintedShortLink> {
    const response = await fetch(`${getBrainstormApi()}/shorturl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(relays?.length ? { kind, key, relays } : { kind, key }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return failure(response, "create");
    const data = (await response.json())?.data;
    if (!data?.shortCode) throw new Error("Short url response carried no code");
    return { shortCode: data.shortCode, ...readLink(data) };
  },

  async resolveShortUrl(code: string): Promise<ResolvedShortLink> {
    const response = await fetch(`${getBrainstormApi()}/shorturl/${encodeURIComponent(code)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return failure(response, "resolve");
    return readLink((await response.json())?.data);
  },
};
