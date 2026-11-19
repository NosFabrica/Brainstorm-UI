/**
 * The words tagging uses, wherever it happens. A profile's picker and a post's
 * are one feature, so they ask, confirm and fail in the same sentences; only
 * what is being tagged changes.
 */
export const TAG_SEARCH_PLACEHOLDER = "Search or create a tag";

/** A tag was added. `reach` is who sees it and where: "Anyone can see this on the post". */
export const taggedToast = (label: string, reach: string) => ({
  title: `Tagged as "${label}"`,
  description: `${reach}.`,
});

/** A vote on a tag that was already there. */
export const voteToast = (label: string, agreeing: boolean) => ({
  title: agreeing ? `You agree with "${label}"` : `You disagreed with "${label}"`,
  description: agreeing ? "Your vote is public." : "Your vote is public, and counts against this tag.",
});

/**
 * The viewer's own tag, from an account the trust filter doesn't count yet: it
 * shows for them and for nobody else. Said the same on a chip's tooltip and on
 * the tag's page, so a tag that works for its author doesn't read, to them, as
 * one everybody sees.
 */
export const WHEN_OTHERS_SEE_IT =
  "Your tags show for other people once your account has a trust score in their network.";
export const ONLY_YOU_SEE_IT = `Only you can see this for now. ${WHEN_OTHERS_SEE_IT}`;

/** A tag nobody counted has applied, which the viewer has: the "only you" case. */
export const onlyViewerSees = (t: { applications: number; myStance?: "apply" | "dispute" | null }) =>
  t.myStance === "apply" && t.applications === 0;

/** The relays took part of it, or none: nothing is claimed. */
export const UNFINISHED_TAGGING = {
  title: "Couldn't finish tagging",
  description: "The relays did not take it. Give it another try in a moment.",
  variant: "destructive" as const,
};

export const UNSAVED_VOTE = {
  title: "Couldn't save your vote",
  description: "Give it another try in a moment.",
  variant: "destructive" as const,
};
