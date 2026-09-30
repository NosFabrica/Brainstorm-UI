/**
 * The tags on one person, for a row in search. The team (2026-09-29): tags
 * are important to see when searching for people — every person row wears
 * theirs, quietly; the tag the words matched is the loud one.
 *
 * The same trust-filtered read the profile's "Known for" row uses
 * (services/tags), under the surface's perspective; only tags the network
 * counts, most applied first. One ask per person and observer for the
 * session; a failed read is nothing, silently, and is asked again next time.
 */
import { fetchProfileTagsBatch, type ProfileTag } from "@/services/tags";

const settled = new Map<string, ProfileTag[]>();
const asked = new Map<string, Promise<ProfileTag[]>>();

const keyOf = (pubkey: string, observer: string) => `${observer}|${pubkey}`;

/**
 * Asks for everyone not yet known in one batch; each person's promise
 * resolves from it. Only tags the network counts, most applied first.
 */
export function fetchPersonTagsBatch(pubkeys: readonly string[], observer: string): Map<string, Promise<ProfileTag[]>> {
  const out = new Map<string, Promise<ProfileTag[]>>();
  const wanted: string[] = [];
  for (const pubkey of new Set(pubkeys.filter(Boolean))) {
    const held = asked.get(keyOf(pubkey, observer));
    if (held) out.set(pubkey, held);
    else wanted.push(pubkey);
  }
  if (wanted.length) {
    const viewer = observer === "house" ? undefined : observer;
    const batch = fetchProfileTagsBatch(wanted, viewer, observer);
    for (const pubkey of wanted) {
      const key = keyOf(pubkey, observer);
      const p = batch
        .then((results) => {
          const tags = (results.get(pubkey)?.tags ?? [])
            .filter((t) => t.counted)
            .sort((a, b) => b.applications - a.applications);
          settled.set(key, tags);
          return tags;
        })
        .catch(() => {
          asked.delete(key); // a failure is not remembered
          return [] as ProfileTag[];
        });
      asked.set(key, p);
      out.set(pubkey, p);
    }
  }
  return out;
}

/** What is already known, synchronously; undefined while the lookup is out or never asked. */
export function peekPersonTags(pubkey: string, observer: string): ProfileTag[] | undefined {
  return settled.get(keyOf(pubkey, observer));
}

/** Test seam. */
export function __resetPersonTags(): void {
  settled.clear();
  asked.clear();
}
