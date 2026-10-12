/**
 * Publishing a list's header or an item on a list (List Management) — signed
 * by the Active Account through signAs, sent where lists are read: the tag
 * hub and the author's own write relays (services/tags `publishTagEvent`),
 * and into the EventStore, so the page shows it at once (ADR 0005).
 *
 * A header with URL templates drafted for it goes through lib/listPublish,
 * which publishes them first; each is then known by id at once, and the link
 * picker's choices are read again to include it.
 */
import type { NostrEvent } from "nostr-tools";
import { requireActiveAccount, signAs } from "@/accounts/signing";
import { publishTagEvent } from "@/services/tags";
import { rememberTemplate } from "@/services/linkTemplates";
import type { EventTemplate } from "@/lib/conceptCopy";
import { URL_TEMPLATE_FIELD } from "@/lib/linkTemplates";
import type { PublishSteps } from "@/lib/listPublish";
import { queryClient } from "@/lib/queryClient";

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
    if (event.tags.some((t) => t[0] === URL_TEMPLATE_FIELD)) {
      rememberTemplate(event);
      void queryClient.invalidateQueries({ queryKey: ["link-templates", "available"] });
    }
  },
};
