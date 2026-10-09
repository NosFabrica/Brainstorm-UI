/**
 * A Trusted List of people (kind 30392), read from its tags: a tag's carriers
 * as one perspective's web of trust ranks them, best first, each with a 0–100
 * score. The content repeats the members as JSON (with endorsement and
 * dispute counts); nothing here reads it.
 *
 *   ["title", …] ["description", …] ["metric", "tag-membership"]
 *   ["observer", <whose perspective>]
 *   ["source-tag", <tag id>, <tag author>, <slug>]
 *   ["cutoff", …] ["min-rank", …] ["rigor", …]
 *   ["p", <member>, "", <score>] …
 */
export const TRUSTED_PEOPLE_KIND = 30392;

export interface TrustedList {
  title: string;
  description?: string;
  metric?: string;
  /** Whose web of trust ranked the members. */
  perspective?: string;
  /** The tag the list was built from: its author and slug. */
  sourceTag?: { authorPubkey: string; slug: string };
  /** The build's parameters, as published: [name, value]. */
  params: Array<[string, string]>;
  /** Best first; `score` is the 0–100 on the `p` row, null when absent. */
  members: Array<{ pubkey: string; score: number | null }>;
}

const HEX64 = /^[0-9a-f]{64}$/i;
const PARAM_TAGS: Array<[tag: string, label: string]> = [
  ["min-rank", "Min rank"],
  ["cutoff", "Cutoff"],
  ["rigor", "Rigor"],
];

const tagOf = (tags: string[][], name: string) => tags.find((t) => t[0] === name);

export function readTrustedList(event: { tags: string[][] }): TrustedList {
  const { tags } = event;
  const source = tagOf(tags, "source-tag");
  const perspective = tagOf(tags, "observer")?.[1];
  const seen = new Set<string>();
  const members: TrustedList["members"] = [];
  for (const t of tags) {
    if (t[0] !== "p" || !t[1] || seen.has(t[1])) continue;
    seen.add(t[1]);
    const n = t[3] === undefined || t[3] === "" ? NaN : Number(t[3]);
    members.push({ pubkey: t[1], score: Number.isFinite(n) ? n : null });
  }
  // Published best first; sort anyway (stable, so ties keep their order).
  members.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
  return {
    title: tagOf(tags, "title")?.[1] || tagOf(tags, "name")?.[1] || "Trusted list",
    description: tagOf(tags, "description")?.[1] || undefined,
    metric: tagOf(tags, "metric")?.[1] || undefined,
    perspective: perspective && HEX64.test(perspective) ? perspective : undefined,
    sourceTag:
      source?.[2] && HEX64.test(source[2]) && source[3] ? { authorPubkey: source[2], slug: source[3] } : undefined,
    params: PARAM_TAGS.flatMap(([tag, label]) => {
      const v = tagOf(tags, tag)?.[1];
      return v ? [[label, v] as [string, string]] : [];
    }),
    members,
  };
}
