/**
 * Writing a trust review of a person. Brainstorm publishes the SAME event
 * Relay Outpost does — its kind-31871 vouch, addressable on the subject
 * (d = p = subject), typed vouch | identity, s=vouched, prose content — so a
 * review written in either app shows in both. Signed by the Active Account,
 * sent through the app's normal outbox, so it lands where the rest of the
 * person's Nostr life does.
 */
import type { NostrEvent } from "nostr-tools";
import { activeAccount, signAs, signingFailure, type PublishOutcome } from "@/accounts/signing";
import { publishToRelays } from "@/services/nostr";

export const VOUCH_KIND = 31871;
export type VouchType = "vouch" | "identity";

const CLIENT_TAG = ["client", "Brainstorm"];

export type VouchOutcome = PublishOutcome & { event?: NostrEvent };

/** Publish (or, for the same subject, update) the viewer's trust review. */
export async function publishVouch(subjectPubkey: string, opts: { type: VouchType; content: string }): Promise<VouchOutcome> {
  const account = activeAccount();
  if (!account) return { success: false, error: "Not logged in" };
  // A vouch for yourself says nothing; readers skip it too.
  if (account.pubkey === subjectPubkey) return { success: false, error: "You can't review yourself" };
  try {
    const signed = await signAs(account, {
      kind: VOUCH_KIND,
      tags: [["d", subjectPubkey], ["p", subjectPubkey], ["t", opts.type], ["s", "vouched"], ["alt", "Trust vouch"], CLIENT_TAG],
      content: opts.content.trim(),
    });
    const res = await publishToRelays(signed);
    return { ...res, event: signed };
  } catch (e) {
    return signingFailure(e);
  }
}

/**
 * Remove the viewer's trust review: a NIP-09 delete naming the event AND its
 * addressable coordinate, so relays drop every version they hold.
 */
export async function revokeVouch(subjectPubkey: string, eventId: string): Promise<PublishOutcome> {
  const account = activeAccount();
  if (!account) return { success: false, error: "Not logged in" };
  try {
    const signed = await signAs(account, {
      kind: 5,
      tags: [["e", eventId], ["a", `${VOUCH_KIND}:${account.pubkey}:${subjectPubkey}`], ["k", String(VOUCH_KIND)], CLIENT_TAG],
      content: "Vouch removed",
    });
    return await publishToRelays(signed);
  } catch (e) {
    return signingFailure(e);
  }
}
