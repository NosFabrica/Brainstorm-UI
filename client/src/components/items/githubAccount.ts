/**
 * A GitHub account as tier three reads it (ADR 0007), apart from its page:
 * which account an item names, and how it reads among many. Light on
 * purpose, since the app's root reaches it through TierThreeProvider; the
 * page itself (GitHubAccountView) loads when an item's page draws it.
 */
import type { ConceptDefinition } from "@/lib/conceptResolution";
import type { ItemPresentation } from "@/lib/itemPresentation";
import { fieldCell } from "@/lib/dlistFields";

export const HANDLE_FIELD = "github-username";
export const BYLINE_FIELD = "description";

export interface GitHubAccount {
  handle: string;
  byline: string | null;
}

/**
 * The account the item names, read through the definition: null when the
 * definition doesn't declare the handle field or the item doesn't fill it.
 */
export function githubAccountOf(item: { tags: string[][] }, definition: ConceptDefinition): GitHubAccount | null {
  const handleDecl = definition.fields.find((f) => f.name === HANDLE_FIELD);
  if (!handleDecl) return null;
  const handle = fieldCell(item, handleDecl).value?.trim();
  if (!handle) return null;
  const bylineDecl = definition.fields.find((f) => f.name === BYLINE_FIELD);
  const byline = bylineDecl ? fieldCell(item, bylineDecl).value?.trim() || null : null;
  return { handle, byline };
}

/** GitHub serves an account's avatar at its handle; the proxy keeps the page from contacting github.com itself. */
export const avatarUrl = (handle: string) => `https://github.com/${encodeURIComponent(handle)}.png?size=160`;

/**
 * How a GitHub account reads wherever it is one among many (ADR 0007): the
 * handle first, the account's own avatar, the description as the line —
 * whatever the copy's display hints say the title is. The handle is read
 * through the definition (githubAccountOf); nothing is asked of GitHub.
 */
export function githubPresentation(
  item: { tags: string[][] },
  definition: ConceptDefinition,
  shown: ItemPresentation,
): ItemPresentation {
  const account = githubAccountOf(item, definition);
  if (!account) return shown;
  const summary = account.byline ?? (shown.summary !== account.handle ? shown.summary : null);
  return {
    ...shown,
    title: account.handle,
    titleField: HANDLE_FIELD,
    summary: summary === account.handle ? null : summary,
    summaryField: account.byline ? BYLINE_FIELD : shown.summaryField,
    image: avatarUrl(account.handle),
  };
}
