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
