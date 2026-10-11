/**
 * Publishing a list's header or an item on a list (List Management) — signed
 * by the Active Account through signAs, sent where lists are read: the tag
 * hub and the author's own write relays (services/tags `publishTagEvent`),
 * and into the EventStore, so the page shows it at once (ADR 0005).
 */
import type { NostrEvent } from "nostr-tools";
import { requireActiveAccount, signAs } from "@/accounts/signing";
import { publishTagEvent } from "@/services/tags";
import type { EventTemplate } from "@/lib/conceptCopy";

export async function publishListEvent(template: EventTemplate): Promise<NostrEvent> {
  const signed = await signAs(requireActiveAccount(), template);
  await publishTagEvent(signed as never);
  return signed;
}
