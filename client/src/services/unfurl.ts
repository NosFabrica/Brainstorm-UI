/**
 * Link metadata for plain URLs. A browser can't read another site's title or
 * description (CORS), so this asks our server's unfurl proxy — the ask in
 * docs/search/RELAY-ASKS.md #7: `GET /api/unfurl?url=…` → `{ title,
 * description, image, siteName }` (wrapped in `data` or bare). Wired ahead
 * of the endpoint: when the server answers, link cards light up sitewide;
 * until then the first 404 opens a session-wide breaker and nothing else
 * asks. Per-URL failures (a page that won't unfurl) are cached as null.
 */
import { env } from "@/lib/runtimeEnv";

export interface Unfurled {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

const cache = new Map<string, Promise<Unfurled | null>>();
let endpointMissing = false;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

async function ask(url: string): Promise<Unfurled | null> {
  const base = (env.VITE_API_URL || "").replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/api/unfurl?url=${encodeURIComponent(url)}`);
    if (res.status === 404 || res.status === 410 || res.status === 501) {
      endpointMissing = true;
      return null;
    }
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Record<string, unknown> } & Record<string, unknown>;
    const body = (json && typeof json.data === "object" && json.data ? json.data : json) as Record<string, unknown>;
    const out: Unfurled = {
      title: str(body.title),
      description: str(body.description),
      image: str(body.image),
      siteName: str(body.siteName ?? body.site_name),
    };
    return out.title || out.description || out.image ? out : null;
  } catch {
    return null;
  }
}

export function fetchUnfurl(url: string): Promise<Unfurled | null> {
  if (endpointMissing) return Promise.resolve(null);
  let p = cache.get(url);
  if (!p) {
    p = ask(url);
    cache.set(url, p);
  }
  return p;
}

/** Test seam. */
export function __resetUnfurl(): void {
  cache.clear();
  endpointMissing = false;
}
