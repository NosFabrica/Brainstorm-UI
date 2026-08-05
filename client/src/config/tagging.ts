/**
 * Deployment config for decentralized tagging — the one place the app reads it.
 *
 * Values live in `tagging.config.json`, copied verbatim from the integration
 * kit. Nothing here (relay URLs, TA pubkeys, namespace pubkeys) may be inlined
 * as a literal in source: pointing the app at a different tag instance has to be
 * a config edit, not a code change.
 *
 * The only value that is overridable at container start is the tag-relay list —
 * `VITE_TAG_RELAY_URLS`, comma-separated. Unset falls back to the JSON. See
 * `docs/decentralized-tagging/DECISIONS.md` for why we start on the house POV.
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

/**
 * The tag hub. Reads query these ∪ the user's read relays; publishes go to
 * these ∪ the user's write relays. The hub is a cold-start default that the
 * reference instances negentropy-sync through — not a protocol requirement,
 * which is why it's overridable.
 */
export const TAG_RELAYS: string[] = dedupe(
  env.VITE_TAG_RELAY_URLS
    ? env.VITE_TAG_RELAY_URLS.split(",")
    : raw.tagRelays,
);

/**
 * Where the house's TA-signed artifacts live: kind-30382 trust assertions and
 * the 3039x Trusted Lists. Deliberately separate from TAG_RELAYS — these are
 * NOT on the hub, and a trust reader wired only to the hub finds nothing and
 * silently degrades to counting everyone.
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
 * Keys honored as AUTHORS of kind-30382 trust assertions. A list because the
 * house's signing key rotates; latest event per subject wins across all of them.
 *
 * Known caveat, accepted for v1: the live corpus is a 2026-05-26 snapshot signed
 * by the retired key, and `unknownPolicy: "trusted"` counts unscored asserters —
 * so expect trust to be permissive until the house re-runs its NIP-85 pipeline.
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
 * Revert this to `raw.trust.maxHops` the moment the house's NIP-85 pipeline
 * starts publishing hops — at that point the check becomes meaningful again.
 */
const HOPS_UNPUBLISHED_UPSTREAM = 999;

export const TRUST_SETTINGS = {
  mode: raw.trust.mode as "house-ta" | "everyone",
  minRank: raw.trust.minRank,
  maxHops: HOPS_UNPUBLISHED_UPSTREAM,
  unknownPolicy: raw.trust.unknownPolicy as "trusted" | "everyone",
} as const;

/**
 * Applicability hint stamped on a tag that is born tagging a person, so the
 * picker can later tell profile tags from note tags.
 */
export const TAG_FOR_NOSTR_PUBKEY_Z = "tag-for-nostr-pubkey";
