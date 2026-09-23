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
/** A DNS name with a letter TLD — no ports, no IP literals. Every visitor's
 *  browser makes this request, so a profile must not be able to aim it at
 *  their LAN (`_@192.168.1.1`) or an arbitrary port. */
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]$/;
const HEX64 = /^[0-9a-f]{64}$/;

/** `_@domain` / `name@domain` / bare `domain` → its parts, or null if malformed. */
export function parseNip05(raw: string | undefined | null): { name: string; domain: string } | null {
  const v = raw?.trim().toLowerCase();
  if (!v) return null;
  const at = v.lastIndexOf("@");
  const name = at === -1 ? "_" : v.slice(0, at);
  const domain = at === -1 ? v : v.slice(at + 1);
  if (!LOCAL.test(name) || !DOMAIN.test(domain)) return null;
  return { name, domain };
}

const OK_TTL_MS = 30 * 60_000;
const FAIL_TTL_MS = 5 * 60_000;
const FETCH_TIMEOUT_MS = 8000;
/** A results page can name dozens of distinct domains; don't open them all at once. */
const MAX_IN_FLIGHT = 6;

type Names = Record<string, unknown> | null;
type Entry = {
  at: number;
  ttl: number;
  names: Promise<Names>;
  /** The settled answer, readable synchronously (undefined while in flight). */
  settled?: Names;
};
const cache = new Map<string, Entry>();

let inFlight = 0;
const waiting: Array<() => void> = [];
async function limited<T>(task: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_IN_FLIGHT) await new Promise<void>((go) => waiting.push(go));
  inFlight++;
  try {
    return await task();
  } finally {
    inFlight--;
    waiting.shift()?.();
  }
}

async function fetchNames(name: string, domain: string): Promise<Names> {
  const res = await fetch(`https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`, {
    // NIP-05: fetchers MUST ignore redirects — a redirect is an answer from
    // someone other than the domain being vouched for.
    redirect: "error",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { names?: unknown } | null;
  const names = body?.names;
  return names && typeof names === "object" ? (names as Record<string, unknown>) : {};
}

function entryFor(name: string, domain: string): Entry {
  const key = `${name}@${domain}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit;
  const entry: Entry = { at: Date.now(), ttl: OK_TTL_MS, names: Promise.resolve(null) };
  entry.names = limited(() => fetchNames(name, domain)).then(
    (names) => (entry.settled = names),
    () => {
      entry.ttl = FAIL_TTL_MS;
      return (entry.settled = null);
    },
  );
  cache.set(key, entry);
  return entry;
}

/** The pubkey the domain maps this name to. Names are meant to be lowercase,
 *  but servers publish mixed case — match case-insensitively, own keys only. */
function mappedKey(names: Record<string, unknown>, name: string): string | undefined {
  const exact = Object.hasOwn(names, name) ? names[name] : undefined;
  if (typeof exact === "string") return exact.toLowerCase();
  for (const [k, v] of Object.entries(names)) {
    if (k.toLowerCase() === name && typeof v === "string") return v.toLowerCase();
  }
  return undefined;
}

function judge(names: Names, name: string, pk: string): Nip05Status {
  if (!names) return "unknown";
  return mappedKey(names, name) === pk ? "verified" : "invalid";
}

function claim(nip05: string | undefined | null, pubkey: string | undefined | null) {
  const parsed = parseNip05(nip05);
  const pk = pubkey?.trim().toLowerCase();
  return parsed && pk && HEX64.test(pk) ? { ...parsed, pk } : null;
}

/** Does the claimed identifier's domain vouch for this pubkey? */
export async function verifyNip05(nip05: string | undefined | null, pubkey: string | undefined | null): Promise<Nip05Status> {
  const c = claim(nip05, pubkey);
  if (!c) return "invalid";
  return judge(await entryFor(c.name, c.domain).names, c.name, c.pk);
}

/**
 * The answer already in hand, without waiting — so a card that remounts
 * (scrolling back, a re-rendered results list) paints its verdict at once
 * instead of flashing the unchecked handle. Undefined when not yet known.
 */
export function peekNip05(nip05: string | undefined | null, pubkey: string | undefined | null): Nip05Status | undefined {
  const c = claim(nip05, pubkey);
  if (!c) return "invalid";
  const hit = cache.get(`${c.name}@${c.domain}`);
  if (!hit || hit.settled === undefined || Date.now() - hit.at >= hit.ttl) return undefined;
  return judge(hit.settled, c.name, c.pk);
}

/** Tests only. */
export function __resetNip05Cache() {
  cache.clear();
}
