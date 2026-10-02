/**
 * Concept resolution, batched — the pattern services/trustSignals uses for
 * author scores. A results page with list items of thirty concepts asks
 * thirty times in one render; each ask waits a moment, and everything asked
 * for the same reader within the window goes out as one `loadDictionary`:
 * one subscription per hundred concepts (community headers and copies as two
 * filters of it), not thirty — the tag hub caps a connection at 20.
 *
 * The window follows the connection, as trustSignals' does, and each new ask
 * extends it until a ceiling. Concurrent asks for one (reader, concept)
 * share a promise; once settled, caching is react-query's job
 * (hooks/useItemConcept), not this module's.
 */
import { connectionSpeed, type ConnectionSpeed } from "@/lib/connection";
import { loadDictionary, type DictionaryReader } from "@/services/dictionary";
import type { ResolvedConcept } from "@/lib/conceptResolution";

const BATCH_WINDOW_MS: Record<ConnectionSpeed, number> = {
  normal: 50,
  slow: 1000,
  "very-slow": 1500,
};
/** A page that never stops producing concepts still gets its answers. */
const MAX_GATHER_MS = 3000;

interface Queue {
  reader: DictionaryReader;
  waiting: Map<string, ((r: ResolvedConcept | null) => void)[]>;
  timer?: ReturnType<typeof setTimeout>;
  since: number;
}

const queues = new Map<string, Queue>();
const inflight = new Map<string, Promise<ResolvedConcept | null>>();

const readerKey = (r: DictionaryReader) => `${r.pubkey ?? ""}|${r.taPubkey ?? ""}`;

export function resolveConceptBatched(reader: DictionaryReader, concept: string): Promise<ResolvedConcept | null> {
  const rk = readerKey(reader);
  const key = `${rk}|${concept}`;
  const existing = inflight.get(key);
  if (existing) return existing;

  let queue = queues.get(rk);
  if (!queue) {
    queue = { reader, waiting: new Map(), since: 0 };
    queues.set(rk, queue);
  }
  const q = queue;
  const promise = new Promise<ResolvedConcept | null>((resolve) => {
    q.waiting.set(concept, [...(q.waiting.get(concept) ?? []), resolve]);
  });
  inflight.set(key, promise);

  const now = Date.now();
  if (!q.since) q.since = now;
  // Extend for the next burst, but never past the ceiling.
  const wait = Math.max(0, Math.min(BATCH_WINDOW_MS[connectionSpeed()], q.since + MAX_GATHER_MS - now));
  clearTimeout(q.timer);
  q.timer = setTimeout(() => void flush(rk), wait);
  return promise;
}

async function flush(rk: string): Promise<void> {
  const q = queues.get(rk);
  if (!q) return;
  queues.delete(rk);
  const concepts = [...q.waiting.keys()];
  const entries = await loadDictionary(q.reader, concepts, undefined, { items: false }).catch(() => []);
  const byConcept = new Map(entries.map((e) => [e.communityCoordinate, e.resolved]));
  for (const concept of concepts) {
    const resolved = byConcept.get(concept) ?? null;
    for (const resolve of q.waiting.get(concept) ?? []) resolve(resolved);
    inflight.delete(`${rk}|${concept}`);
  }
}

/** Test seam. */
export function __resetConceptBatch(): void {
  for (const q of queues.values()) clearTimeout(q.timer);
  queues.clear();
  inflight.clear();
}
