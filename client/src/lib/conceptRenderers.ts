/**
 * Brainstorm's renderers for the concepts it knows (ADR 0004). A renderer
 * adds what the header can't say — which field names the item, where it
 * lives off Nostr — on top of the governing definition's fields, which every
 * item page draws whatever renderer applies. Config names which concept a
 * renderer is registered for (`renderer` in dictionary.config.json); a
 * concept with none, or a copy that dropped the field a renderer is built
 * on, gets the generic view.
 *
 * Found along the resolved concept's chain, nearest first: a copy pointing
 * at GitHub Accounts renders as a GitHub account; pointing at someone
 * else's definition later is one more link on the same chain.
 */
import { rendererKeyOf } from "@/config/dictionary";
import type { ResolvedConcept } from "@/lib/conceptResolution";

export interface ItemLink {
  label: string;
  href: string;
}

export interface ConceptRenderer {
  key: string;
  /** The field whose value names an item — its title. */
  titleField: string;
  /** Where an item lives off Nostr, from its field values. */
  links?: (value: (field: string) => string | null) => ItemLink[];
}

/** GitHub's own rule for a username: alphanumerics and single inner hyphens, 39 at most. */
const GITHUB_USERNAME = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

const RENDERERS: Record<string, ConceptRenderer> = {
  "github-account": {
    key: "github-account",
    titleField: "github-username",
    links: (value) => {
      const username = value("github-username")?.trim();
      return username && GITHUB_USERNAME.test(username)
        ? [{ label: `github.com/${username}`, href: `https://github.com/${username}` }]
        : [];
    },
  },
};

/**
 * The renderer for a resolved concept, or null for the generic view. One
 * built on a field the governing definition no longer declares doesn't
 * apply: it would draw the community's shape over a copy that changed it.
 */
export function rendererFor(
  resolved: ResolvedConcept,
  keyOf: (coordinate: string) => string | null = rendererKeyOf,
): ConceptRenderer | null {
  for (const coordinate of resolved.chain) {
    const key = keyOf(coordinate);
    const renderer = key ? RENDERERS[key] : undefined;
    if (!renderer) continue;
    return resolved.governing.fields.some((f) => f.name === renderer.titleField) ? renderer : null;
  }
  return null;
}
