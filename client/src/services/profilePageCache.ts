import type { ProfileContent } from "applesauce-core/helpers/profile";
import type { ReportMetadata, MuteMetadata } from "./nostr";
import { onViewerChange } from "@/lib/accountScoped";

export class LRUMap<K, V> {
  private map = new Map<K, V>();
  constructor(public cap: number) {}

  get size(): number {
    return this.map.size;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  get(key: K): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined && this.map.has(key)) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }

  set(key: K, value: V): this {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, value);
    if (this.map.size > this.cap) {
      const firstKey = this.map.keys().next().value as K | undefined;
      if (firstKey !== undefined) this.map.delete(firstKey);
    }
    return this;
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  forEach(cb: (value: V, key: K) => void): void {
    this.map.forEach(cb);
  }
}

const GLOBAL_KEY = "__brainstormProfilePageCache__";
type CacheBucket = {
  expandProfileCache: LRUMap<string, ProfileContent>;
  // Pubkeys we've already tried to fetch a kind-0 profile for (whether or not
  // one came back). Lets a row fall back to its npub instead of an endless
  // skeleton when no profile exists.
  expandProfileAttempted: LRUMap<string, true>;
  /** Per viewer and preset (`trustScopeKey`): a score is one viewer's, under one preset. */
  expandTrustCaches: LRUMap<string, LRUMap<string, number | null>>;
  reportMetadataCache: LRUMap<string, ReportMetadata[]>;
  muteMetadataCache: LRUMap<string, MuteMetadata>;
};

const g = globalThis as unknown as { [GLOBAL_KEY]?: CacheBucket };

const bucket: CacheBucket =
  g[GLOBAL_KEY] ??
  (g[GLOBAL_KEY] = {
    expandProfileCache: new LRUMap<string, ProfileContent>(5000),
    expandProfileAttempted: new LRUMap<string, true>(5000),
    expandTrustCaches: new LRUMap<string, LRUMap<string, number | null>>(4),
    reportMetadataCache: new LRUMap<string, ReportMetadata[]>(1000),
    muteMetadataCache: new LRUMap<string, MuteMetadata>(5000),
  });

export const expandProfileCache = bucket.expandProfileCache;
export const expandProfileAttempted = bucket.expandProfileAttempted;

/** Whose scores, under which preset — "-" for nobody signed in, or no preset yet. */
export function trustScopeKey(viewer: string | null | undefined, preset: string | null | undefined): string {
  return `${viewer || "-"}|${preset || "-"}`;
}

/**
 * The connection rows' trust scores for one viewer under one preset. It was one
 * map keyed by pubkey alone, so it outlived an account switch and a preset
 * change and kept showing the old scores. The last few scopes are kept, so
 * switching back is instant. (Cluster A's account-change reset can clear this
 * bucket too, once it lands.)
 */
export function expandTrustCacheFor(
  viewer: string | null | undefined,
  preset: string | null | undefined,
): LRUMap<string, number | null> {
  const key = trustScopeKey(viewer, preset);
  let cache = bucket.expandTrustCaches.get(key);
  if (!cache) {
    cache = new LRUMap<string, number | null>(10000);
    bucket.expandTrustCaches.set(key, cache);
  }
  return cache;
}
// Each scope is already the viewer's and preset's own; another Account or
// Perspective starts clean all the same (lib/accountScoped).
onViewerChange(() => bucket.expandTrustCaches.clear());
export const reportMetadataCache = bucket.reportMetadataCache;
export const muteMetadataCache = bucket.muteMetadataCache;
