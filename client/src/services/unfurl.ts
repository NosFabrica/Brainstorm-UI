/**
 * Link metadata for plain URLs. A browser can't read another site's title or
 * description (CORS), so this asks our own origin, which nginx proxies to the
 * link-preview service: `GET /link-preview?url=…` → `{ title, description,
 * image, siteName }` wrapped in `data`.
 *
 * Same-origin is load-bearing, not tidiness. The service picks a rate-limit
 * tier from `Sec-Fetch-Site`: same-origin traffic gets a ceiling no real user
 * meets, everything else gets a tight throttle. Asking the API host instead
 * would make our own SPA look like a stranger and land it in the throttle.
 *
 * Per-URL results are memoised for the session, failures included — a page
 * that won't unfurl is asked once. Concurrency is capped so a feed of link
 * notes doesn't open twenty sockets at first paint.
 */

export interface Unfurled {
  /** Set when the link is itself media served without a file extension. */
  kind: "page" | "image" | "video";
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

/** Beyond the service's own deadline, so a slow answer still arrives. */
const TIMEOUT_MS = 6000;
/** A feed paints many cards at once; the service is one small pod. */
const MAX_IN_FLIGHT = 4;

const cache = new Map<string, Promise<Unfurled | null>>();
let inFlight = 0;
let waiting: (() => void)[] = [];

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

async function gate<T>(run: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_IN_FLIGHT) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  inFlight += 1;
  try {
    return await run();
  } finally {
    inFlight -= 1;
    waiting.shift()?.();
  }
}

async function ask(url: string): Promise<Unfurled | null> {
  try {
    const res = await fetch(`/link-preview?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Record<string, unknown> } & Record<string, unknown>;
    // The service always wraps; tolerate a bare body so a proxy that unwraps
    // on our behalf doesn't silently blank every card.
    const body = (json && typeof json.data === "object" && json.data ? json.data : json) as Record<string, unknown>;
    const out: Unfurled = {
      kind: body.kind === "image" || body.kind === "video" ? body.kind : "page",
      title: str(body.title),
      description: str(body.description),
      image: str(body.image),
      siteName: str(body.siteName ?? body.site_name),
    };
    return out.kind === "video" || out.title || out.description || out.image ? out : null;
  } catch {
    return null;
  }
}

export function fetchUnfurl(url: string): Promise<Unfurled | null> {
  let p = cache.get(url);
  if (!p) {
    p = gate(() => ask(url));
    cache.set(url, p);
  }
  return p;
}

/** Test seam. */
export function __resetUnfurl(): void {
  cache.clear();
  inFlight = 0;
  waiting = [];
}
