/**
 * What a search had loaded, for its next life. Opening a result and coming
 * back used to restart at page one (2026-09-09): a reader ten pages deep
 * landed at the top with nothing below. Module-level so it outlives the
 * page; ten minutes and eight searches deep, which is a browsing session.
 * (components/search/SearchResults remembers and recalls through these.)
 */
import type { SearchHit } from "@/services/search";

const SEARCH_MEMORY = new Map<string, { hits: SearchHit[]; scrollY: number; at: number }>();
/** The composed page remembers a list per section, not one list. */
const COMPOSED_MEMORY = new Map<string, { sections: Record<string, SearchHit[]>; scrollY: number; at: number }>();
const SEARCH_MEMORY_TTL_MS = 10 * 60_000;
const SEARCH_MEMORY_SIZE = 8;
export function rememberKey(query: string, tab: string, pov: string, userPubkey?: string): string {
  return [query, tab, pov, userPubkey ?? ""].join("\u0000");
}
export function rememberSearch(key: string, hits: SearchHit[], scrollY: number): void {
  SEARCH_MEMORY.delete(key);
  SEARCH_MEMORY.set(key, { hits, scrollY, at: Date.now() });
  while (SEARCH_MEMORY.size > SEARCH_MEMORY_SIZE) SEARCH_MEMORY.delete(SEARCH_MEMORY.keys().next().value as string);
}
export function rememberComposed(key: string, sections: Record<string, SearchHit[]>, scrollY: number): void {
  if (!Object.values(sections).some((hits) => hits.length)) return;
  COMPOSED_MEMORY.delete(key);
  COMPOSED_MEMORY.set(key, { sections, scrollY, at: Date.now() });
  while (COMPOSED_MEMORY.size > SEARCH_MEMORY_SIZE)
    COMPOSED_MEMORY.delete(COMPOSED_MEMORY.keys().next().value as string);
}

export function recallComposed(key: string): { sections: Record<string, SearchHit[]>; scrollY: number } | null {
  const m = COMPOSED_MEMORY.get(key);
  if (!m) return null;
  if (Date.now() - m.at > SEARCH_MEMORY_TTL_MS) {
    COMPOSED_MEMORY.delete(key);
    return null;
  }
  return { sections: m.sections, scrollY: m.scrollY };
}

/** Tests: forget every search. */
export function __resetSearchMemory(): void {
  SEARCH_MEMORY.clear();
  COMPOSED_MEMORY.clear();
}
export function recallSearch(key: string): { hits: SearchHit[]; scrollY: number } | null {
  const m = SEARCH_MEMORY.get(key);
  if (!m) return null;
  if (Date.now() - m.at > SEARCH_MEMORY_TTL_MS) {
    SEARCH_MEMORY.delete(key);
    return null;
  }
  return m;
}
