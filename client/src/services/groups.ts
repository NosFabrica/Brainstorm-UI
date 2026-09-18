/**
 * What the `group:` picker asks. A NIP-50 search over kind-39000 group metadata on the search
 * relay, ranked by `lib/nip29`, with the names it learns cached for the pills.
 *
 * `group:` with nothing typed after it is not a match-all over every room on the network — it
 * has no answer worth a list, so the picker says what to type instead.
 */
import type { NostrEvent } from "nostr-tools";
import { searchRelay } from "@/lib/searchRelay";
import { metaGroup, rank, seedGroupNames, type GroupCandidate } from "@/lib/nip29";

const GROUP_META_KIND = 39000;
const LIMIT = 12;
const TIMEOUT_MS = 4000;

/**
 * The groups whose metadata matches what has been typed, best first. Resolves at EOSE or the
 * deadline with whatever arrived — never rejects, because a picker that throws is worse than
 * a picker that is empty.
 */
export function suggestGroups(partial: string, timeoutMs = TIMEOUT_MS): Promise<GroupCandidate[]> {
  const typed = partial.trim();
  if (!typed) return Promise.resolve([]);
  const relay = searchRelay();
  if (!relay) return Promise.resolve([]);
  return new Promise((resolve) => {
    const found: GroupCandidate[] = [];
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sub.unsubscribe();
      // Everything the picker drew is a name the pills can use.
      seedGroupNames(found);
      resolve(rank(typed, found));
    };
    const sub = relay
      // `include:spam`: a group's metadata is signed by its host relay's key, which no
      // reader's web of trust has an opinion about. Ranking it away would empty the list.
      .req({ kinds: [GROUP_META_KIND], search: `${typed} include:spam`, limit: LIMIT })
      .subscribe({
        error: finish,
        next: (msg: { type: string; event?: NostrEvent }) => {
          if (msg.type === "EVENT" && msg.event) {
            const cand = metaGroup(msg.event);
            if (cand) found.push(cand);
          } else if (msg.type === "EOSE" || msg.type === "CLOSED") finish();
        },
      });
    const timer = setTimeout(finish, timeoutMs);
  });
}

/**
 * Name the ids a pill is drawing but cannot say — a `group:` that arrived in a url or a paste
 * was never offered by the picker. Resolves with how many pills draw differently now.
 */
export function nameGroups(ids: string[], timeoutMs = TIMEOUT_MS): Promise<number> {
  const want = [...new Set(ids.filter(Boolean))];
  if (!want.length) return Promise.resolve(0);
  const relay = searchRelay();
  if (!relay) return Promise.resolve(0);
  return new Promise((resolve) => {
    const found: GroupCandidate[] = [];
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sub.unsubscribe();
      resolve(seedGroupNames(found));
    };
    const sub = relay
      .req({ kinds: [GROUP_META_KIND], "#d": want, search: "include:spam", limit: want.length * 4 })
      .subscribe({
        error: finish,
        next: (msg: { type: string; event?: NostrEvent }) => {
          if (msg.type === "EVENT" && msg.event) {
            const cand = metaGroup(msg.event);
            if (cand) found.push(cand);
          } else if (msg.type === "EOSE" || msg.type === "CLOSED") finish();
        },
      });
    const timer = setTimeout(finish, timeoutMs);
  });
}
