/**
 * Deployment config for decentralized tagging — the one place the app reads it.
 *
 * Values live in `tagging.config.json`, copied verbatim from the integration
 * kit. Nothing here (relay URLs, TA pubkeys, namespace pubkeys) may be inlined
 * as a literal in source: pointing the app at a different tag instance has to be
 * a config edit, not a code change.
 *
 * The tag-relay list is the one value anyone can change, in three layers:
 * a user's saved list (Settings) → `VITE_TAG_RELAY_URLS` at container start →
 * the kit's JSON. `core/ACCEPTANCE.md` Hygiene requires that a user can edit it
 * and that the edit persists, and the kit's own `_tagRelays` note asks for the
 * same. See `docs/decentralized-tagging/DECISIONS.md` for why we start on the
 * house POV.
 */
import raw from "./tagging.config.json";
import { env } from "@/lib/runtimeEnv";

/**
 * The kit's URLs have no trailing slash; ours (PROFILE_RELAYS et al.) do. Both
 * forms address the same relay, but a set union would keep both and we'd open
 * two sockets to one host. Normalize everything to the no-trailing-slash form.
 */
function normalizeRelay(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function dedupe(urls: string[]): string[] {
  return Array.from(new Set(urls.map(normalizeRelay).filter(Boolean)));
}

/** A relay URL we're willing to store. Anything else is a typo, not a relay. */
export function isRelayUrl(url: string): boolean {
  return /^wss?:\/\/[^\s/$.?#][^\s]*$/i.test(url.trim());
}

/**
 * The tag hub as shipped. Reads query these ∪ the user's read relays; publishes
 * go to these ∪ the user's write relays. The hub is a cold-start default that
 * the reference instances negentropy-sync through — not a protocol requirement,
 * which is why it's overridable.
 */
export const DEFAULT_TAG_RELAYS: string[] = dedupe(
  env.VITE_TAG_RELAY_URLS
    ? env.VITE_TAG_RELAY_URLS.split(",")
    : raw.tagRelays,
);

const TAG_RELAYS_KEY = "brainstorm.tagRelays";

function loadStoredTagRelays(): string[] | null {
  try {
    const stored = window.localStorage?.getItem(TAG_RELAYS_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return null;
    const list = dedupe(parsed.filter((u): u is string => typeof u === "string" && isRelayUrl(u)));
    // An empty saved list would leave the app with nowhere to read tags from
    // and no way to tell that from "tags don't exist". Treat it as no override.
    return list.length ? list : null;
  } catch {
    return null; // unparseable or storage blocked → ship defaults
  }
}

let storedTagRelays: string[] | null = loadStoredTagRelays();

/**
 * The tag relays in force right now. A function, not a const, because Settings
 * can change it mid-session and every read has to pick that up without a reload.
 */
export function tagRelays(): string[] {
  return storedTagRelays ?? DEFAULT_TAG_RELAYS;
}

/** True when the user is running their own list rather than the shipped one. */
export function isTagRelayOverrideActive(): boolean {
  return storedTagRelays !== null;
}

/**
 * Persist a user's tag-relay list. Returns the list actually stored, which
 * drops blanks, duplicates and anything that isn't a ws/wss URL. Passing an
 * empty list clears the override and returns to the shipped default.
 */
export function setTagRelays(urls: string[]): string[] {
  const list = dedupe(urls.filter(isRelayUrl));
  try {
    if (list.length) window.localStorage?.setItem(TAG_RELAYS_KEY, JSON.stringify(list));
    else window.localStorage?.removeItem(TAG_RELAYS_KEY);
  } catch {
    // Storage blocked (private mode, quota). The in-memory change below still
    // applies for this session — better than refusing the edit outright.
  }
  storedTagRelays = list.length ? list : null;
  return tagRelays();
}

/**
 * Where the kit's TA-signed APPLICABILITY lists live (the 3039x Trusted Lists
 * that say which tags describe people vs events).
 *
 * NO LONGER used for kind-30382 trust assertions (#41 B1-proper). Those now come
 * from the relay each observer's own kind-10040 names — see
 * `services/trustSource.ts`. This constant survives for the applicability read
 * only, which is an editorial hint signed by the kit's assistant rather than a
 * claim about anyone's standing, so it has no observer and no perspective.
 */
export const TRUST_RELAYS: string[] = dedupe(raw.trustRelays);

/**
 * Concept namespaces, canonical first. Passed as `zHandlePubkeys` to every
 * builder and filter. The canonical entry is a legacy namespace that all
 * reference instances share so historical tags stay visible across deployments.
 */
export const Z_HANDLE_PUBKEYS: string[] = raw.zHandlePubkeys;

/** The house instance's Tapestry Assistant — signs the applicability lists. */
export const LOCAL_TA_PUBKEY: string = raw.localTaPubkey;

/**
 * DEAD FOR TRUST READS as of issue #41 B1-proper. Kept only because
 * `tagging.config.json` must stay byte-identical to the vendored kit.
 *
 * These keys belong to the TAPESTRY reference deployment. Reading them meant
 * every trust decision in the tag UI came from another instance's corpus:
 * measured 2026-08-11, `wss://tags.brainstorm.world/relay` held 500 kind-30382
 * events, every one signed by the RETIRED key `bfb6e1e8…` and stamped
 * 2026-05-26. One day's snapshot, from a key no longer in use, for every viewer.
 *
 * Trust now resolves per observer — `services/trustSource.ts` reads the
 * observer's own kind-10040 (via `fetchTrustProviderList`, the same reader the
 * activation flow uses) and honors the TA + relay it names. Nothing static.
 *
 * A correction, because an earlier version of this comment asserted otherwise
 * and was wrong: `wss://nip85.nosfabrica.com` is NOT "Brainstorm's own corpus
 * under author c8c7df76… with rank 8–99". It holds MANY observers' assistants —
 * one identifies itself as "ManyKeys's Brainstorm Assistant" — and a capped
 * query returns whichever author's block the relay happens to serve, which is
 * where that reading came from. There is no single house corpus on it.
 */
export const NIP85_AUTHOR_PUBKEYS: string[] = raw.nip85AuthorPubkeys;

/**
 * The live corpus does not publish `hops` — verified 2026-08-05 across 500
 * kind-30382 events on the house relay: every one carries `d`, `rank` and
 * `followers`, and NOT ONE carries `hops`.
 *
 * That matters because the SDK reads a missing `hops` as 999 ("unreachable")
 * and then tests `hops <= maxHops`. With the kit's `maxHops: 20`, every asserter
 * who HAS a published score fails, while everyone with no score at all passes
 * through `unknownPolicy: "trusted"` — precisely backwards. It's what made
 * david@bitcoinpark, `rank: 100` (the maximum), read as untrusted.
 *
 * So we neutralize the hops criterion and let `rank` do the gating it was
 * meant to do. Absence of a dimension is not a failing score on it. The
 * override lives here rather than in tagging.config.json so that file stays
 * byte-identical to the kit and re-vendoring diffs stay clean.
 *
 * NOT a local deviation: the reference client does the same. Jumble prints its
 * baked-in defaults in its own user guide — `mode=house-ta minRank=1
 * maxHops=999 unknown=trusted`. Two independent integrations corrected the same
 * shipped value, which makes `CONFIG.json`'s `20` the thing that's wrong.
 *
 * STATUS 2026-08-11, now that trust resolves per observer (#41 B1-proper): the
 * corpora we actually read DO publish `hops`. The house TA on
 * `wss://scores.brainstorm.world` carries it on every sampled event, values 2–5.
 *
 * The override therefore stops being correct-by-absence and becomes a deliberate
 * "don't filter on reachability". That is still the right call for tagging — a
 * tagging is a claim about someone, and how many follow-hops away its author
 * happens to sit is not what makes it credible; `rank` already carries that. But
 * it is now a POLICY choice rather than a workaround, and should be decided
 * rather than inherited.
 *
 * Issue #41 asserts "0 of 300 events in the House corpus carry hops" and
 * instructs that this note be struck. That measurement was taken against the
 * Tapestry relay, not ours, so the instruction is left unactioned on purpose.
 */
const HOPS_UNPUBLISHED_UPSTREAM = 999;

/**
 * An account with NO published score does not count.
 *
 * Read `sdk/trust.js`: the predicate for an uncached pubkey is
 * `unknownPolicy === 'trusted'`, so ANY other string means "doesn't count". The
 * kit spells that value `"everyone"` — which reads like the exact opposite of
 * what it does, hence the name here. Do not inline the literal.
 *
 * Why it changed (issue #41 B1): shipping `"trusted"` meant the predicate
 * admitted every asserter — measured 105 of 105 on the live corpus, 0 rejected.
 * The reported case is a profile carrying a tagging from a throwaway account
 * with no standing at all, which the reference client filters out and we didn't.
 *
 * Measured before flipping, 2026-08-11, so the collateral is known rather than
 * assumed: across 3322 taggings on the hub this silences 89.6%, but that is the
 * QA harness, not people. Real tags are untouched — `musician` 16→16,
 * `tunestr-community` 28→28, `aos-2026-participant` 100→99, `bitcoin-vendor`
 * 34→33, `lfo` 54→47. 15 of 105 asserters carry essentially all real content.
 *
 * This rule, not `minRank`, is what does the filtering. Measured against the
 * house TA after repointing (#41 B1-proper): it scores 21 of the 106 accounts
 * that have tagged anyone, and their ranks run 2, 2, 17, 18, 21, 42, 71 … 100.
 * The floor IS 2, so `minRank: 2` and `minRank: 1` return an identical set —
 * the threshold only starts excluding anyone around 5. Keep it as a policy floor
 * if that's the intent, but don't expect it to change what's on screen; the 85
 * accounts with no published score are the ones being filtered.
 */
const UNSCORED_DOES_NOT_COUNT = "everyone";

export const TRUST_SETTINGS = {
  mode: raw.trust.mode as "house-ta" | "everyone",
  minRank: raw.trust.minRank,
  maxHops: HOPS_UNPUBLISHED_UPSTREAM,
  unknownPolicy: UNSCORED_DOES_NOT_COUNT as "trusted" | "everyone",
} as const;

/**
 * Applicability hint stamped on a tag that is born tagging a person, so the
 * picker can later tell profile tags from note tags.
 */
export const TAG_FOR_NOSTR_PUBKEY_Z = "tag-for-nostr-pubkey";

/**
 * Comments on tags — a Brainstorm extension, NOT part of the kit.
 *
 * No kit document defines a comment layer: not `Start.md`, not `CONFIG.json`,
 * not `ACCEPTANCE.md`, not the protocol specs. Built and working (NIP-22
 * kind-1111 anchored on the tag-element), but off, so an acceptance run sees
 * only what the kit describes and no client copies an anchor the kit hasn't
 * ratified.
 *
 * Flip to `true` to demo it. The open question — tag-element vs individual
 * tagging — is in `docs/decentralized-tagging/COMMENTS-PROPOSAL.md`, and the
 * relay constraint it runs into is `KIT-FEEDBACK.md` §6.
 */
export const TAG_COMMENTS_ENABLED = false;

/**
 * Pinning tags into a personal curated set — built, and OFF.
 *
 * Unlike comments, this one IS in the protocol: `core/protocol/tags.md` §Pins
 * specifies the event, the `curation-method` payload and NIP-09 unpinning. What
 * makes it a deviation is that `core/INTEGRATION.md` §8 lists it under
 * "Explicitly OUT of scope for the core (do not build; do not preclude) — Tag
 * pinning / Trusted-List publication from the client", and Brainstorm's
 * `Start.md` never pulls it back in. The SDK agrees: it ships the read half and
 * no pin builder.
 *
 * Built on Benjamin's explicit call (2026-08-06) and defaulted off, so an
 * acceptance run sees only what the kit describes. Flip to `true` to demo.
 * Rationale and the ask to scope it in: `DECISIONS.md` §8, `KIT-FEEDBACK.md` §14.
 */
export const TAG_PINS_ENABLED = false;
