/**
 * Pure logic for folding together tags that different authors minted under the
 * same name. No relays, no signer, no React — kept out of `services/tags.ts` so
 * it can be tested without dragging in the whole nostr stack.
 *
 * Why this exists: nothing stops two people creating "Bitcoin". The protocol
 * says that's fine and expects readers to rank the duplicates rather than
 * prevent them. But two chips both reading "Bitcoin" looks like a bug, so we
 * show one and combine its support.
 */

/**
 * A tag's counted support, as distinct asserter pubkeys.
 *
 * The subject's own assertions are deliberately NOT in `applications` /
 * `disputes` — they live in `selfApplied` / `selfDisputed`. Someone saying a
 * thing about themselves is a different claim from other people saying it, and
 * folding the two together is what let self-tagging masquerade as network
 * attestation once the self-declared role chips were retired.
 */
export interface CountedTag {
  authorPubkey: string;
  slug: string;
  /** Distinct third parties who applied it. Excludes the subject. */
  applications: Set<string>;
  /** Distinct third parties who disputed it. Excludes the subject. */
  disputes: Set<string>;
  /** The subject applied this to themselves. */
  selfApplied: boolean;
  /** The subject disputed it — their objection, shown but never a veto. */
  selfDisputed: boolean;
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
      },
      variantKeys,
    };
  });
}

/**
 * The viewer's stance on a merged tag. It follows the NAME, not the identity:
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
