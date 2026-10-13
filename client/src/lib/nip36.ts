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

/**
 * What a reveal belongs to: the event, and for a replaceable or addressable one
 * its address (`kind:pubkey:d`, `kind:pubkey`) — a stream updating its viewer
 * count is the same stream, and the reader's "show" should not be undone by it.
 * A key for the components that hold the "shown" state.
 */
export function revealKeyOf(event: { id: string; kind: number; pubkey: string; tags: string[][] }): string {
  const { kind } = event;
  if (kind >= 30000 && kind < 40000)
    return `${kind}:${event.pubkey}:${event.tags.find((t) => t[0] === "d")?.[1] ?? ""}`;
  if (kind === 0 || kind === 3 || (kind >= 10000 && kind < 20000)) return `${kind}:${event.pubkey}`;
  return event.id;
}
