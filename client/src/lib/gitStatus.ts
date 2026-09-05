/**
 * NIP-34 status events say what became of an issue or a patch: kind 1630
 * open, 1631 applied (merged for a patch, resolved for an issue), 1632
 * closed, 1633 draft. The newest per item wins; none at all means open.
 */
export const GIT_STATUS_KINDS = [1630, 1631, 1632, 1633] as const;

export type GitState = "open" | "merged" | "resolved" | "closed" | "draft";

export function gitStateOf(statusKind: number | undefined, itemKind: number): GitState {
  switch (statusKind) {
    case 1631:
      return itemKind === 1617 ? "merged" : "resolved";
    case 1632:
      return "closed";
    case 1633:
      return "draft";
    default:
      return "open";
  }
}

export const GIT_STATE_LABEL: Record<GitState, string> = {
  open: "Open",
  merged: "Merged",
  resolved: "Resolved",
  closed: "Closed",
  draft: "Draft",
};

/** Chip tones: open reads as live, merged/resolved as done, closed and draft as quiet. */
export const GIT_STATE_TONE: Record<GitState, "success" | "info" | "neutral" | "slate"> = {
  open: "success",
  merged: "info",
  resolved: "info",
  closed: "neutral",
  draft: "slate",
};

/** The repo an issue or patch belongs to — the d-tag of its `a` coordinate. */
export function gitRepoNameOf(event: { tags: string[][] }): string | null {
  const a = event.tags.find((t) => t[0] === "a")?.[1];
  const d = a?.split(":")[2];
  return d || null;
}

/** An issue's or patch's labels — its `t` tags, lower-cased, de-duplicated. */
export function gitLabelsOf(event: { tags: string[][] }): string[] {
  return [...new Set(event.tags.filter((t) => t[0] === "t" && t[1]?.trim()).map((t) => t[1].trim().toLowerCase()))];
}

/**
 * Who filed it — a person, or an agent? Two tells: the event's own
 * `buzz-origin-agent` tag (with the agent's name), or an author that says
 * so — a NIP-24 `bot: true` profile, or "agent" / "bot" as a whole word in
 * the name ("Yuki (Personal Agent)", "DanConwayDev's Agent"). Probed
 * 2026-09-05: under the house lens no browse issue carried the tag, but
 * 41 of 100 came from such authors. Legitimate work — a page where most
 * issues are agent-written just reads like a job queue, so people lead and
 * agents follow, each marked. Null for a person.
 */
const AGENT_WORD = /(?:^|[^a-z])(?:agent|bot)(?:$|[^a-z])/i;

export type AgentAuthor = { name?: string; displayName?: string; bot?: boolean } | null | undefined;

export function gitAgentOf(event: { tags: string[][] }, author?: AgentAuthor): string | null {
  const t = event.tags.find((t) => t[0] === "buzz-origin-agent");
  if (t) return t[1]?.trim() || "agent";
  if (!author) return null;
  const label = author.displayName || author.name || "";
  if (author.bot === true || AGENT_WORD.test(author.name ?? "") || AGENT_WORD.test(author.displayName ?? "")) return label || "agent";
  return null;
}

/** People's items first, agents' after — a stable partition. */
export function peopleBeforeAgents<T>(items: T[], pick: (item: T) => { event: { tags: string[][] }; author?: AgentAuthor }): T[] {
  const isAgent = (i: T) => {
    const { event, author } = pick(i);
    return !!gitAgentOf(event, author);
  };
  return [...items.filter((i) => !isAgent(i)), ...items.filter((i) => isAgent(i))];
}
