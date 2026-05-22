import type { ProfileContent } from "applesauce-core/helpers/profile";
import type { ReportMetadata, MuteMetadata } from "./nostr";

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
  expandTrustCache: LRUMap<string, number | null>;
  reportMetadataCache: LRUMap<string, ReportMetadata[]>;
  muteMetadataCache: LRUMap<string, MuteMetadata>;
};

const g = globalThis as unknown as { [GLOBAL_KEY]?: CacheBucket };

const bucket: CacheBucket =
  g[GLOBAL_KEY] ??
  (g[GLOBAL_KEY] = {
    expandProfileCache: new LRUMap<string, ProfileContent>(5000),
    expandTrustCache: new LRUMap<string, number | null>(10000),
    reportMetadataCache: new LRUMap<string, ReportMetadata[]>(1000),
    muteMetadataCache: new LRUMap<string, MuteMetadata>(5000),
  });

export const expandProfileCache = bucket.expandProfileCache;
export const expandTrustCache = bucket.expandTrustCache;
export const reportMetadataCache = bucket.reportMetadataCache;
export const muteMetadataCache = bucket.muteMetadataCache;
