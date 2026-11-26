/** Whose taggings count: one trust source per observer, built from the relay their own kind 10040 names. */
import { fetchEventsByFilter } from "@/services/nostr";
import { resolveHouseObserver, resolveTrustSource } from "@/services/trustSource";
import { createHouseTrustSource, trustEveryone, type TrustPredicate } from "@/lib/tagging-sdk/trust.js";
import { TRUST_SETTINGS } from "@/config/tagging";
import { tagValue, type NostrEvent } from "./shared";

/**
 * How many trust assertions have come back so far. Read as a delta around an
 * `ensure()` to tell "the house scored these people" from "we learned nothing
 * about them".
 *
 * Since the policy flipped to "unscored does not count" (issue #41 B1), those
 * two cases are no longer indistinguishable in the counts — they're
 * indistinguishable in the EMPTINESS. A dead trust relay and a person nobody
 * reputable has tagged both render as no tags, and only this counter can tell
 * them apart.
 */
let trustEventsSeen = 0;

/**
 * Trust reads go to the relay the OBSERVER'S OWN kind-10040 names — not to a
 * relay this module picked. Pointing it anywhere else means the fetch succeeds,
 * finds nothing, and every asserter fails the predicate, so every tag on the
 * site disappears. Silent and total, which is why `trustEventsSeen` exists.
 */
function makeTrustFetcher(relay: string) {
  return async (filter: Record<string, unknown>): Promise<NostrEvent[]> => {
    const events = (await fetchEventsByFilter(filter, [relay])) as NostrEvent[];
    trustEventsSeen += events.length;
    return events;
  };
}

/**
 * One trust source per OBSERVER, cached for the session.
 *
 * Keyed by observer because the answer genuinely differs per perspective — that
 * is the entire point of NIP-85 and of the Brainstorm / My-perspective toggle.
 * The same asserter can be rank 100 to one observer's assistant and unknown to
 * another's; measured on the live corpus, one account is rated 11, 26 and 100 by
 * three different assistants.
 *
 * Each entry keeps the SDK's own 30382 cache alive across profile views, so we
 * only ever fetch the asserters we actually encountered.
 */
export const trustSources = new Map<string, ReturnType<typeof createHouseTrustSource>>();

/**
 * The trust source for one observer, built from the relay + TA their own
 * kind-10040 names.
 *
 * `null` means "count everyone" — an operator choice via `mode`, not a
 * degradation. `undefined` means we could not resolve this observer at all;
 * callers treat that as untrusted-and-say-so, never as a free pass.
 */
async function getTrustSource(
  observerPubkey: string | undefined,
): Promise<ReturnType<typeof createHouseTrustSource> | null | undefined> {
  if (TRUST_SETTINGS.mode !== "house-ta") return null;
  if (!observerPubkey) return undefined;

  const cached = trustSources.get(observerPubkey);
  if (cached) return cached;

  const ref = await resolveTrustSource(observerPubkey);
  if (!ref) return undefined;

  const source = createHouseTrustSource({
    fetchEvents: makeTrustFetcher(ref.relay),
    assertionAuthorPubkeys: [ref.taPubkey],
    minRank: TRUST_SETTINGS.minRank,
    maxHops: TRUST_SETTINGS.maxHops,
    unknownPolicy: TRUST_SETTINGS.unknownPolicy,
  });
  trustSources.set(observerPubkey, source);
  return source;
}

/**
 * Which observer's perspective a read runs from.
 *
 * `"house"` is the logged-out / Brainstorm view — the deployment's house observer
 * (`resolveHouseObserver`: `VITE_HOUSE_OBSERVER`), never hardcoded here. A hex pubkey is a specific
 * observer, normally the signed-in viewer in personalized mode.
 */
export type TrustObserver = "house" | string;

async function observerPubkeyFor(observer: TrustObserver): Promise<string | undefined> {
  if (observer !== "house") return observer;
  return (await resolveHouseObserver()) ?? undefined;
}

/** A POV predicate, plus whether the house actually had anything to say. */
export interface ResolvedTrust {
  predicate: TrustPredicate;
  /**
   * True when we asked about asserters and learned nothing about any of them —
   * unreachable trust relays, or a POV with no published scores.
   *
   * Under the current policy that means everything got filtered out, so the
   * surface goes EMPTY. An empty tag list reads as a fact about the person
   * ("nobody has tagged them"), which is why this flag has to reach the empty
   * states: silence and "we couldn't check" must not look the same. C7 asks
   * that this degrade quietly rather than error; it does not ask that we imply
   * the filter ran.
   */
  unverified: boolean;
}

/**
 * Resolve the POV predicate for a set of asserters, from `observer`'s point of
 * view. Never throws: an unreachable relay leaves those pubkeys uncached in the
 * SDK, and they then fail the predicate rather than passing it — so the caller
 * gets an empty result and has to say why, via `unverified`.
 */
export async function resolveTrust(asserters: string[], observer: TrustObserver = "house"): Promise<ResolvedTrust> {
  const observerPubkey = await observerPubkeyFor(observer);
  let source = await getTrustSource(observerPubkey);

  // A signed-in viewer who has never activated has no assistant, so no
  // perspective to compute from. Fall back to the HOUSE view rather than to
  // "count everyone" — a missing declaration is not a reason to trust
  // strangers, and it's the difference between "we don't know you yet" and
  // "the filter is off".
  if (source === undefined && observer !== "house") {
    const housePubkey = await observerPubkeyFor("house");
    source = await getTrustSource(housePubkey);
  }

  // "Everyone counts" is a POV the operator chose, not a degraded one.
  if (source === null) return { predicate: trustEveryone(), unverified: false };

  // Nobody left to ask. Trust nothing, and set the flag so the surface says
  // "couldn't check" instead of rendering an empty list as a fact.
  if (!source) return { predicate: () => false, unverified: true };

  await source.ensure(asserters);
  // The predicate alone can't distinguish "checked, and none of them qualify"
  // from "never got an answer" — both are just `false`. What it can't hide is
  // that the trust source handed us nothing at all this session, which happens
  // when the resolved relay is unreachable, or when a 10040 points somewhere
  // that carries no kind-30382.
  return {
    predicate: source.predicate,
    unverified: asserters.length > 0 && trustEventsSeen === 0,
  };
}

/**
 * Which of these pubkeys have a PUBLISHED trust score?
 *
 * Related to the trust predicate but not the same question, and it stays
 * separate now that the predicate rejects unscored keys too. The predicate
 * answers "does this asserter's vote count"; this answers "has the house said
 * anything at all about this key" — which is what BROWSE needs, because a tag
 * whose creator nobody has heard of should be findable-but-labelled rather than
 * silently promoted. Keeping them apart is also what lets a tag survive an
 * unknown creator when reputable people have applied it.
 *
 * Used to gate what appears in BROWSE surfaces. See `fetchTagIndex`.
 *
 * Reads the same resolved source as the predicate, so "known" and "counts" are
 * answers from ONE perspective. Asking two different scoreboards would let a tag
 * be labelled "unknown creator" while that creator's assertions were counting.
 */
export async function fetchScoredPubkeys(pubkeys: string[], observer: TrustObserver = "house"): Promise<Set<string>> {
  const unique = Array.from(new Set(pubkeys.filter(Boolean)));
  if (!unique.length) return new Set();

  const ref = await resolveTrustSource((await observerPubkeyFor(observer)) ?? "");
  // No resolvable source → nobody is "known". Browse falls back to labelling
  // creators as unverified, which is the honest read when we can't check.
  if (!ref) return new Set();
  const readTrust = makeTrustFetcher(ref.relay);

  const scored = new Set<string>();
  // Chunked to keep the filter under what relays accept, same as the SDK's own
  // trust reader.
  for (let i = 0; i < unique.length; i += 100) {
    try {
      const events = await readTrust({
        kinds: [30382],
        authors: [ref.taPubkey],
        "#d": unique.slice(i, i + 100),
      });
      for (const ev of events) {
        const d = tagValue(ev, "d");
        if (d) scored.add(d);
      }
    } catch {
      // Can't tell → don't hide anyone. A trust relay outage must not empty the
      // catalogue; the failure mode is a noisier page, not a blank one.
      return new Set(unique);
    }
  }
  return scored;
}
