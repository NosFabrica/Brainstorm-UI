/**
 * NIP-36: a creator's own mark that their post is sensitive, with the reason
 * when they gave one. Read from the `content-warning` tag, or from NIP-32
 * labels (`l`) in the `content-warning` namespace, which some clients publish
 * beside it or in its place. Any kind can carry one.
 */
export interface ContentWarning {
  reason?: string;
}

export function contentWarningOf(event: { tags: string[][] }): ContentWarning | null {
  const tag = event.tags.find((t) => t[0] === "content-warning");
  const labels = event.tags
    .filter((t) => t[0] === "l" && t[2] === "content-warning" && t[1]?.trim())
    .map((t) => t[1].trim());
  if (!tag && labels.length === 0) return null;
  const reason = tag?.[1]?.trim() || labels.join(", ");
  return reason ? { reason } : {};
}
