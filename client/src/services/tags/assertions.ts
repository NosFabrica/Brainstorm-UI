/** Profile taggings read apart: each assertion's tag, target, asserter and stance, grouped by tag or by target. */
import { conceptNostrUserTag } from "@/lib/tagging-sdk/profile-tagging.js";
import type { TrustPredicate } from "@/lib/tagging-sdk/trust.js";
import type { CountedTag } from "@/lib/tagMerge";
import { Z_HANDLE_PUBKEYS } from "@/config/tagging";
import { fetchTagEvents } from "./read";
import { cacheElementMeta, elementsById, type TagRefResolved } from "./elements";
import { tagValue, type NostrEvent } from "./shared";

/** >= 0.5 applies, <= -0.5 disputes, anything between is neither. */
function bucketize(ev: NostrEvent): "apply" | "dispute" | "neutral" {
  const raw = Number(tagValue(ev, "polarity"));
  const p = Number.isFinite(raw) ? raw : 1; // absent polarity reads as an apply
  if (p >= 0.5) return "apply";
  if (p <= -0.5) return "dispute";
  return "neutral";
}

/**
 * Split raw kind-39999 assertions into counted-per-tag support plus the
 * viewer's own stances.
 *
 * This mirrors the discipline of the SDK's `classifyEventTaggings` but cannot
 * reuse it: that classifier resolves an indirect per-tag *header* before it can
 * name a tag, and profile-tag assertions are the DIRECT shape.
 *
 * **Identity comes from `a` OR `e`.** The protocol's normative shape puts the
 * tag in `a`, but `protocol/tags.md` §Taggings is explicit that the deployed
 * publishers still emit the original `d/p/e/z/polarity` shape without it, and
 * that "a reader needing completeness MUST union `#a` lookups with legacy `#e`
 * lookups against the tag-element's event ids."
 *
 * We originally required `a` and were wrong. Of 2928 assertions on the hub,
 * **2905 have no `a`** — and they are not junk: they carry `AOS 2026
 * Participant` (109), `LFO` (60), `Bitcoin Vendor` (35), `Tunestr Community`
 * (28), `Musician` (16), on 68 targets with real kind-0 profiles. Requiring `a`
 * hid roughly 99% of real tagging. The earlier reasoning generalised from a
 * newest-first sample that happened to be almost entirely QA-harness output.
 */
export interface NormalizedAssertion {
  /** `<tagAuthor>|<slug>` — the tag's identity. */
  tagKey: string;
  tagAuthor: string;
  slug: string;
  /** The pubkey being tagged. */
  target: string;
  /** The pubkey doing the tagging. */
  asserter: string;
  stance: "apply" | "dispute";
  /** When it was signed — the only honest basis for a "recently added" sort. */
  at: number;
}

/**
 * Resolve every candidate's tag identity, using `a` where present and falling
 * back to resolving the `e` tag-element by id — the union the protocol requires.
 *
 * One batched fetch for all the `e`-only ids, not one per assertion. The
 * elements are immutable in practice, so this is cache-friendly.
 */
async function resolveAssertionTags(candidates: NostrEvent[]): Promise<Map<string, TagRefResolved>> {
  const byEventId = new Map<string, TagRefResolved>();
  const needElement = new Set<string>();

  for (const ev of candidates) {
    const a = tagValue(ev, "a");
    const m = a && /^39999:([0-9a-f]{64}):(.+)$/.exec(a);
    if (m) {
      byEventId.set(ev.id, { tagAuthor: m[1], slug: m[2] });
      continue;
    }
    const e = tagValue(ev, "e");
    if (!e) continue;
    const cached = elementsById.get(e);
    if (cached) byEventId.set(ev.id, cached);
    else needElement.add(e);
  }

  if (needElement.size) {
    const ids = Array.from(needElement);
    const elements: NostrEvent[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      try {
        elements.push(...(await fetchTagEvents({ ids: ids.slice(i, i + 200) })));
      } catch {
        // Partial resolution beats none — the assertions we couldn't resolve
        // just don't count, exactly as if their tag had been deleted.
      }
    }
    for (const el of elements) {
      const d = tagValue(el, "d");
      if (!d) continue;
      elementsById.set(el.id, { tagAuthor: el.pubkey, slug: d });
      // We are holding the whole element, so bank its name/description too.
      // `resolveTagNames` would otherwise re-fetch the same events by
      // coordinate — cheap when the catalogue was 34 entries, a query over
      // hundreds of slugs now that it carries everything.
      cacheElementMeta(el.pubkey, d, el.content);
    }
    for (const ev of candidates) {
      if (byEventId.has(ev.id)) continue;
      const resolved = elementsById.get(tagValue(ev, "e") ?? "");
      if (resolved) byEventId.set(ev.id, resolved);
    }
  }

  return byEventId;
}

export async function normalizeAssertions(candidates: NostrEvent[]): Promise<NormalizedAssertion[]> {
  const honored = new Set(Z_HANDLE_PUBKEYS.map(conceptNostrUserTag));
  const tagOf = await resolveAssertionTags(candidates);

  // Latest-wins per (tag, target, asserter). The d-tag is deterministic for
  // that triple, so a re-tag replaces rather than stacks — but relays can hand
  // us both the old and new copy, and an apply↔dispute flip has to collapse to
  // the newer stance instead of counting as both.
  const latest = new Map<string, NostrEvent>();
  for (const ev of candidates) {
    if (!(ev.tags || []).some((t) => t[0] === "z" && honored.has(t[1]))) continue;
    const ref = tagOf.get(ev.id);
    if (!ref) continue;
    const target = tagValue(ev, "p");
    if (!target) continue;
    const key = `${ref.tagAuthor}|${ref.slug}|${target}|${ev.pubkey}`;
    const prev = latest.get(key);
    if (!prev || ev.created_at > prev.created_at) latest.set(key, ev);
  }

  const out: NormalizedAssertion[] = [];
  for (const [composite, ev] of latest) {
    const [tagAuthor, slug, target] = composite.split("|");
    const stance = bucketize(ev);
    if (stance === "neutral") continue;
    out.push({
      tagKey: `${tagAuthor}|${slug}`,
      tagAuthor,
      slug,
      target,
      asserter: ev.pubkey,
      stance,
      at: ev.created_at,
    });
  }
  return out;
}

/** Group normalized assertions BY TAG — the profile read. */
export function groupByTag(
  assertions: NormalizedAssertion[],
  isAsserterTrusted: TrustPredicate,
  viewerPubkey?: string,
): {
  counted: Map<string, CountedTag>;
  mine: Map<string, "apply" | "dispute">;
} {
  const counted = new Map<string, CountedTag>();
  const mine = new Map<string, "apply" | "dispute">();

  for (const a of assertions) {
    // The viewer's own stance is recorded BEFORE the trust filter, so a tag
    // they just applied doesn't disappear under a POV that doesn't count them.
    if (viewerPubkey && a.asserter === viewerPubkey) mine.set(a.tagKey, a.stance);
    if (!isAsserterTrusted(a.asserter)) continue;

    if (!counted.has(a.tagKey)) {
      counted.set(a.tagKey, {
        authorPubkey: a.tagAuthor,
        slug: a.slug,
        applications: new Set(),
        disputes: new Set(),
        selfApplied: false,
        selfDisputed: false,
        addedAt: 0,
      });
    }
    const grp = counted.get(a.tagKey)!;

    // The subject's own voice is FLAGGED but still counted. The kit's rule is
    // "count per p target (trust-filtered, net apply−dispute > 0)" with no self
    // exclusion, and ACCEPTANCE C1 requires our net to match the reference
    // instance's — so dropping the subject's own assertion put us one behind
    // Jumble on every self-tagged person. The flag survives because
    // self-declaration really is a different kind of claim; that distinction
    // belongs in the label, not in the arithmetic.
    if (a.asserter === a.target) {
      if (a.stance === "apply") grp.selfApplied = true;
      else grp.selfDisputed = true;
    }
    if (a.stance === "apply" && a.at > grp.addedAt) grp.addedAt = a.at;
    (a.stance === "apply" ? grp.applications : grp.disputes).add(a.asserter);
  }

  return { counted, mine };
}

export interface TargetSupport {
  applications: Set<string>;
  disputes: Set<string>;
  selfApplied: boolean;
  selfDisputed: boolean;
  /** Newest applying assertion, for the "recently added" sort. */
  addedAt: number;
}

/** Group normalized assertions BY TARGET — the tag-page read. */
export function groupByTarget(
  assertions: NormalizedAssertion[],
  isAsserterTrusted: TrustPredicate,
): Map<string, TargetSupport> {
  const byTarget = new Map<string, TargetSupport>();
  for (const a of assertions) {
    if (!isAsserterTrusted(a.asserter)) continue;
    if (!byTarget.has(a.target)) {
      byTarget.set(a.target, {
        applications: new Set(),
        disputes: new Set(),
        selfApplied: false,
        selfDisputed: false,
        addedAt: 0,
      });
    }
    const grp = byTarget.get(a.target)!;
    if (a.stance === "apply" && a.at > grp.addedAt) grp.addedAt = a.at;
    // Flagged, not excluded — see the note in groupByTag. The tag page's counts
    // have to agree with the profile chips and with the reference instance.
    if (a.asserter === a.target) {
      if (a.stance === "apply") grp.selfApplied = true;
      else grp.selfDisputed = true;
    }
    (a.stance === "apply" ? grp.applications : grp.disputes).add(a.asserter);
  }
  return byTarget;
}
