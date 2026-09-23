/**
 * NIP-05 verification. A kind-0 `nip05` is only a CLAIM — anyone can paste
 * `_@hzrd149.com` into their profile. It is verified only when the domain's
 * `/.well-known/nostr.json?name=<local>` maps that name to the same pubkey.
 * Until then the UI must not draw a check next to it.
 *
 * One fetch per `name@domain`, remembered: a search for a popular handle
 * returns dozens of copycats claiming the same identifier, and they all share
 * the one answer.
 */

export type Nip05Status =
  /** The domain maps this name to this pubkey. */
  | "verified"
  /** The domain answered, and this pubkey is not who it names. */
  | "invalid"
  /** Not asked yet, still waiting, or the domain couldn't be reached. */
  | "unknown";

/** Local parts NIP-05 allows: a-z0-9-_. (compared lowercase). */
const LOCAL = /^[a-z0-9._-]+$/;
const DOMAIN = /^[a-z0-9.-]+(:\d+)?$/;
const HEX64 = /^[0-9a-f]{64}$/;

/** `_@domain` / `name@domain` / bare `domain` → its parts, or null if malformed. */
export function parseNip05(raw: string | undefined | null): { name: string; domain: string } | null {
  const v = raw?.trim().toLowerCase();
  if (!v) return null;
  const at = v.lastIndexOf("@");
  const name = at === -1 ? "_" : v.slice(0, at);
  const domain = at === -1 ? v : v.slice(at + 1);
  if (!LOCAL.test(name) || !DOMAIN.test(domain) || !domain.includes(".")) return null;
  return { name, domain };
}

const OK_TTL_MS = 30 * 60_000;
const FAIL_TTL_MS = 5 * 60_000;

type Entry = { at: number; ttl: number; names: Promise<Record<string, string> | null> };
const cache = new Map<string, Entry>();

/** The domain's `names` map for this local part, or null when it couldn't be read. */
function lookup(name: string, domain: string): Promise<Record<string, string> | null> {
  const key = `${name}@${domain}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.names;
  const entry: Entry = { at: Date.now(), ttl: OK_TTL_MS, names: Promise.resolve(null) };
  entry.names = (async () => {
    try {
      const res = await fetch(`https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`, {
        // NIP-05: fetchers MUST ignore redirects — a redirect is an answer from
        // someone other than the domain being vouched for.
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { names?: unknown };
      const names = body?.names;
      if (!names || typeof names !== "object") return {};
      return names as Record<string, string>;
    } catch {
      entry.ttl = FAIL_TTL_MS;
      return null;
    }
  })();
  cache.set(key, entry);
  return entry.names;
}

/** Does the claimed identifier's domain vouch for this pubkey? */
export async function verifyNip05(nip05: string | undefined | null, pubkey: string | undefined | null): Promise<Nip05Status> {
  const parsed = parseNip05(nip05);
  const pk = pubkey?.trim().toLowerCase();
  if (!parsed || !pk || !HEX64.test(pk)) return "invalid";
  const names = await lookup(parsed.name, parsed.domain);
  if (!names) return "unknown";
  const mapped = names[parsed.name];
  return typeof mapped === "string" && mapped.toLowerCase() === pk ? "verified" : "invalid";
}

/** Tests only. */
export function __resetNip05Cache() {
  cache.clear();
}
