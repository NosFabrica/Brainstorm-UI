/**
 * Pure logic about tags that different authors minted under the same name. No
 * relays, no signer, no React — kept out of `services/tags.ts` so it can be
 * tested without dragging in the whole nostr stack.
 *
 * Nothing stops two people creating "Bitcoin". The protocol says that's fine
 * and expects readers to rank the duplicates rather than prevent them.
 *
 * We used to fold them into one chip with combined support. That is now OFF:
 * combining changes the arithmetic, so we reported one number where the
 * protocol has two tags, and ACCEPTANCE C1 requires our net counts to match the
 * reference instance's view. Duplicates now render separately, each with its
 * own true count, and `countNameCollisions` supplies the disambiguation the
 * merge used to hide.
 *
 * `mergeSameNamedTags` / `stanceForVariants` are kept, tested and unwired
 * against the open question filed as KIT-FEEDBACK.md §3 — if the kit rules that
 * clients SHOULD converge duplicate names, rewiring is a one-line change at
 * each call site. Do not re-enable them without that ruling.
 */

/**
 * A tag's counted support, as distinct asserter pubkeys.
 *
 * The subject's own assertion IS included here, and additionally flagged via
 * `selfApplied` / `selfDisputed`. The kit counts distinct trusted asserters
 * with no self exclusion, so excluding the subject put every self-tagged
 * person one behind the reference instance. Self-declaration is still a
 * different kind of claim — that belongs in the label, not the number.
 */
export interface CountedTag {
  authorPubkey: string;
  slug: string;
  /** Distinct asserters who applied it, the subject included. */
  applications: Set<string>;
  /** Distinct asserters who disputed it, the subject included. */
  disputes: Set<string>;
  /** The subject applied this to themselves — also counted in `applications`. */
  selfApplied: boolean;
  /** The subject disputed it — their objection, shown but never a veto. */
  selfDisputed: boolean;
  /**
   * Unix seconds of the newest APPLYING assertion. The only honest basis for
   * "what's new since I last looked" — mirrors `TargetSupport.addedAt` on the
   * tag-page path. Disputes don't move it: a tag being argued about isn't the
   * same event as a tag being added.
   */
  addedAt: number;
}

/**
 * How many separately-minted tag identities share each display name.
 *
 * Replaces the merge as the answer to "why do I see 'Bitcoin' twice?": both
 * entries stay, each keeps its own honest count, and a name carrying more than
 * one identity can be labelled as such. Keyed by `<author>|<slug>`.
 */
export function countNameCollisions(
  counted: Map<string, CountedTag>,
  names: Map<string, { name: string; description?: string }>,
): Map<string, number> {
  const perName = new Map<string, number>();
  for (const [key, group] of counted) {
    const bucket = normalizeTagName(names.get(key)?.name || group.slug);
    perName.set(bucket, (perName.get(bucket) ?? 0) + 1);
  }

  const out = new Map<string, number>();
  for (const [key, group] of counted) {
    const bucket = normalizeTagName(names.get(key)?.name || group.slug);
    out.set(key, perName.get(bucket) ?? 1);
  }
  return out;
}

export interface MergedTag {
  /** The surviving variant's `<author>|<slug>` key. */
  key: string;
  group: CountedTag;
  name: string;
  description?: string;
  /** Every tag identity folded into this one, including the survivor. */
  variantKeys: string[];
}

/** The display name two tag identities have to share to be treated as one. */
export function normalizeTagName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Collapse same-named tags into one, combining their support.
 *
 * UNWIRED — see the module note. Kept against KIT-FEEDBACK.md §3.
 *
 * The merge is over the SETS of asserters, never their sizes: somebody who
 * vouched for both variants is one person and must count once. Adding the
 * numbers would count them twice and inflate the tag.
 *
 * The survivor is the best-supported variant — that is what "web-of-trust
 * signals surface the most relevant one" means in practice — and its coordinate
 * is what the chip links to. Ties break on pubkey so every client lands on the
 * same variant without coordinating.
 */
export function mergeSameNamedTags(
  counted: Map<string, CountedTag>,
  names: Map<string, { name: string; description?: string }>,
): MergedTag[] {
  const byName = new Map<
    string,
    Array<{ key: string; group: CountedTag; name: string; description?: string }>
  >();

  for (const [key, group] of counted) {
    const meta = names.get(key);
    const display = meta?.name || group.slug;
    const bucket = normalizeTagName(display);
    if (!byName.has(bucket)) byName.set(bucket, []);
    byName.get(bucket)!.push({ key, group, name: display, description: meta?.description });
  }

  return Array.from(byName.values()).map((variants) => {
    const canonical = [...variants].sort(
      (a, b) =>
        b.group.applications.size - a.group.applications.size ||
        a.group.authorPubkey.localeCompare(b.group.authorPubkey),
    )[0];
    const variantKeys = variants.map((v) => v.key);
    if (variants.length === 1) return { ...canonical, variantKeys };

    const applications = new Set<string>();
    const disputes = new Set<string>();
    for (const v of variants) {
      for (const pk of v.group.applications) applications.add(pk);
      for (const pk of v.group.disputes) disputes.add(pk);
    }
    return {
      key: canonical.key,
      name: canonical.name,
      description: canonical.description,
      group: {
        authorPubkey: canonical.group.authorPubkey,
        slug: canonical.group.slug,
        applications,
        disputes,
        // Saying it about yourself under any spelling of the name still counts
        // as saying it; disputing any variant still counts as objecting.
        selfApplied: variants.some((v) => v.group.selfApplied),
        selfDisputed: variants.some((v) => v.group.selfDisputed),
        // The most recent time anyone applied ANY spelling — folding two tags
        // into one chip means the chip is as new as its newest half.
        addedAt: Math.max(...variants.map((v) => v.group.addedAt)),
      },
      variantKeys,
    };
  });
}

/**
 * The viewer's stance on a merged tag. UNWIRED alongside `mergeSameNamedTags`;
 * with duplicates rendered separately, a stance is read per identity.
 *
 * It follows the NAME, not the identity:
 * having applied any variant means they stand behind the tag. Apply beats
 * dispute, so agreeing with one variant isn't masked by an older disagreement
 * with another.
 */
export function stanceForVariants(
  variantKeys: string[],
  mine: Map<string, "apply" | "dispute">,
): "apply" | "dispute" | undefined {
  const stances = variantKeys.map((k) => mine.get(k)).filter(Boolean);
  if (stances.includes("apply")) return "apply";
  if (stances.includes("dispute")) return "dispute";
  return undefined;
}
