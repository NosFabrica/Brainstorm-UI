/**
 * A Retired account: one its owner no longer uses (CONTEXT.md).
 *
 * Not Compromised: the owner still holds the key and nothing it posted is in
 * doubt. The record exists to send a reader on to the owner's Current account,
 * so it always names one.
 */
export interface RetiredStatus {
  pubkey: string;
  /** The account the owner uses now. */
  currentPubkey: string;
}
