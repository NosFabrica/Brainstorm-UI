/**
 * Hosts on the reader's own device or LAN, and when the app may reach one.
 *
 * Nostr data is public, and people publish addresses that only mean something
 * on their own network: the relay on their phone (Citrine's
 * `ws://localhost:4869`), their home server (`ws://umbrel.local:4848`,
 * `ws://192.168.1.10`). To every OTHER reader those name the reader's own
 * machine. Connecting there is useless at best, and Chrome answers it with a
 * "wants to access other apps and services on this device" (Local Network
 * Access) prompt that reads as if Brainstorm were asking for something.
 *
 * So a local address from someone else's data is refused. One the reader chose
 * themselves — a relay they typed, a `bunker://` link they pasted, one in their
 * own relay list, one the deployment configured — is theirs to reach:
 * `allowLocalRelay`.
 *
 * A LEAF: imports nothing of ours but the runtime env, so `relayList`,
 * `relayPool` and `nip05` can all use it.
 */
import { env } from "./runtimeEnv";

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Names that only resolve inside a LAN: mDNS, RFC 8375, ICANN's private-use TLD, and the ones routers hand out. */
const LOCAL_SUFFIXES = [".localhost", ".local", ".lan", ".home.arpa", ".internal", ".localdomain", ".home"];

/**
 * A host on the reader's own device or network: loopback, private, link-local
 * and CGNAT addresses, `localhost`, LAN-only names, and single-label names
 * (`raspberrypi`), which no public relay has. A public name that merely
 * RESOLVES to a private address can't be seen from here; the literal forms are
 * what published data actually carries.
 *
 * `hostname` as `URL` gives it: lower-cased, IPv4 in dotted form however it
 * was written, IPv6 in brackets with leading zeros dropped.
 */
export function isLocalNetworkHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return false;

  if (host.startsWith("[") && host.endsWith("]")) {
    const v6 = host.slice(1, -1);
    if (v6 === "::" || v6 === "::1") return true;
    // IPv4-mapped (`::ffff:7f00:1` once URL has canonicalized it).
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v6);
    if (mapped) {
      const hi = parseInt(mapped[1], 16);
      const lo = parseInt(mapped[2], 16);
      return isLocalNetworkHost(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    // fc00::/7 unique-local, fe80::/10 link-local — a full first hextet only:
    // canonical form drops leading zeros, so `fe8::` is 0x0fe8, not fe80::/10.
    return /^f[cd][0-9a-f]{2}:/.test(v6) || /^fe[89ab][0-9a-f]:/.test(v6);
  }

  const v4 = IPV4.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 || // "this network"; 0.0.0.0 reaches the local machine
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT, often a LAN or tailnet
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  return !host.includes(".") || LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/**
 * Served from the reader's own machine or LAN (a dev server, a self-hosted
 * build)? Then local relays may well be the point, and nothing is refused.
 * Nor with no page at all (a script, a node test): there is no reader whose
 * network this would reach into.
 */
const PAGE_IS_LOCAL = !globalThis.location || isLocalNetworkHost(globalThis.location.hostname);

function parse(url: string): URL | null {
  try {
    return new URL(url.trim());
  } catch {
    return null;
  }
}

/** Consent is per `host:port` — the thing a socket opens. */
const allowed = new Set<string>();

/**
 * Bumped whenever what is refused changes, so a result computed under the old
 * consent (a parsed relay list, `relayList`) knows to be computed again.
 */
let version = 0;
export function consentVersion(): number {
  return version;
}

/**
 * The reader chose these relays themselves — typed them, pasted them in a
 * `bunker://` link, or the deployment configured them — so reaching them on a
 * local address is what they asked for, prompt and all. Consent lasts for the
 * session; the places that hold such a choice (a saved signer, a saved tag
 * relay list) call this again when they load it.
 */
export function allowLocalRelay(urls: Iterable<string>): void {
  for (const url of urls) {
    const parsed = parse(url);
    if (parsed && !allowed.has(parsed.host)) {
      allowed.add(parsed.host);
      version++;
    }
  }
}

/** The accounts signed in on this device — the reader, in every identity they use here. */
let own = new Set<string>();

/**
 * Who the reader is. A relay in the reader's OWN relay list is one they chose
 * — Citrine on the phone they are reading on is exactly that — so
 * `relayList` approves the local relays in a list these keys signed.
 */
export function setReadersOwnPubkeys(pubkeys: Iterable<string>): void {
  const next = new Set([...pubkeys].map((pubkey) => pubkey.toLowerCase()));
  if (next.size === own.size && [...next].every((pubkey) => own.has(pubkey))) return;
  own = next;
  version++;
}

export function isReadersOwnPubkey(pubkey: unknown): boolean {
  return typeof pubkey === "string" && own.has(pubkey.toLowerCase());
}

/** The deployment's own relays are the operator's choice. */
allowLocalRelay(
  [env.VITE_NIP85_RELAY_URL, env.VITE_WOT_SEARCH_RELAY, env.VITE_SEARCH_RELAY_URL, env.VITE_TAG_RELAY_URLS]
    .flatMap((value) => (value ?? "").split(","))
    .map((url) => url.trim())
    .filter(Boolean),
);

/**
 * A relay this page must not connect to: one on the reader's own device or
 * network that the reader did not choose. False for anything that isn't a URL —
 * whether it is a relay at all is the caller's question.
 */
export function isUnreachableLocalRelay(url: string): boolean {
  if (PAGE_IS_LOCAL) return false;
  const parsed = parse(url);
  return !!parsed && !allowed.has(parsed.host) && isLocalNetworkHost(parsed.hostname);
}
