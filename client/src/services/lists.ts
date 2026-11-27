/**
 * Publishing a list's header or an item on a list (List Management) — signed
 * by the Active Account through signAs, sent where lists are read: the tag
 * hub and the author's own write relays (services/tags `publishTagEvent`),
 * and into the EventStore, so the page shows it at once (ADR 0005).
 *
 * A header with URL templates drafted for it goes through lib/listPublish,
 * which publishes them first; each then lands in the store, so a link that
 * pins it and the link picker's choices (hooks/useLinkTemplates) see it at once.
 */
import type { NostrEvent } from "nostr-tools";
import { requireActiveAccount, signAs } from "@/accounts/signing";
import { publishTagEvent } from "@/services/tags";
import type { EventTemplate } from "@/lib/conceptCopy";
import type { PublishSteps } from "@/lib/listPublish";

export async function publishListEvent(template: EventTemplate): Promise<NostrEvent> {
  const signed = await signAs(requireActiveAccount(), template);
  await publishTagEvent(signed as never);
  return signed;
}

/** lib/listPublish's steps, as the Active Account. */
export const listPublishSteps: PublishSteps = {
  sign: (template) => signAs(requireActiveAccount(), template),
  publish: async (event) => {
    await publishTagEvent(event as never);
  },
};
