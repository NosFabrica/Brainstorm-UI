/**
 * NIP-40: an event's `expiration` tag, the moment its author asked for it to
 * be forgotten. Any kind can carry one.
 *
 * Only a whole number of seconds is a time here. `expirationOf` in
 * lib/dm/giftWrap reads a message's expiration through `Number()`, which also
 * takes a decimal or "1e9", so that one stays where it is.
 */
type Tagged = { tags: string[][] };

/** Unix seconds, or nothing when the tag is missing or is not a time. */
export function expirationOf(event: Tagged): number | undefined {
  const value = event.tags.find((t) => t[0] === "expiration")?.[1]?.trim() ?? "";
  if (!/^\d+$/.test(value)) return undefined;
  const at = Number(value);
  return Number.isSafeInteger(at) && at > 0 ? at : undefined;
}

/** Has the event's expiration passed? */
export function isExpired(event: Tagged, nowSeconds: number): boolean {
  const at = expirationOf(event);
  return at !== undefined && at <= nowSeconds;
}
