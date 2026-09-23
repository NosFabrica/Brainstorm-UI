/**
 * A NIP-05 handle to a pubkey, shared. The search box resolved handles with a
 * private helper (pages/landing.tsx) and a Primal link needs the same lookup
 * for `<name>@primal.net`: one reader, cached for the session — failures
 * too, the way link previews are (services/unfurl) — that answers null instead
 * of throwing. A link that cannot resolve is a link, not an error.
 */
const HEX64 = /^[0-9a-f]{64}$/i;
const cache = new Map<string, Promise<string | null>>();

/** `name@domain` → `{ name, domain }`; a bare domain is its `_` name. Lowercased: NIP-05 names are case-insensitive. */
function splitHandle(handle: string): { name: string; domain: string } {
  const trimmed = handle.trim().toLowerCase();
  const at = trimmed.indexOf("@");
  return at === -1 ? { name: "_", domain: trimmed } : { name: trimmed.slice(0, at), domain: trimmed.slice(at + 1) };
}

export function resolveNip05(handle: string, timeoutMs = 8000): Promise<string | null> {
  const { name, domain } = splitHandle(handle);
  if (!name || !domain) return Promise.resolve(null);
  const key = `${name}@${domain}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const pending = (async () => {
    try {
      const resp = await fetch(`https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as { names?: Record<string, unknown> };
      const pubkey = data?.names?.[name];
      return typeof pubkey === "string" && HEX64.test(pubkey) ? pubkey.toLowerCase() : null;
    } catch {
      return null;
    }
  })();
  cache.set(key, pending);
  return pending;
}

/** Test seam. */
export function __resetNip05(): void {
  cache.clear();
}
