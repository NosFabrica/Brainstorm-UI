/**
 * Publishing and withdrawing the reader's own version of a concept
 * (lib/conceptCopy) — signed by the Active Account, sent where tags go: the
 * tag hub, where concepts are read, and the author's own write relays
 * (services/tags `publishTagEvent`). Withdrawing is a replacement, not a
 * NIP-09 deletion: the hub doesn't take kind 5.
 */
import { requireActiveAccount, signAs } from "@/accounts/signing";
import { publishTagEvent } from "@/services/tags";
import { copyTemplate, withdrawnTemplate, type CopyDraft } from "@/lib/conceptCopy";
import type { ConceptDefinition } from "@/lib/conceptResolution";

export async function publishOwnCopy(community: ConceptDefinition, draft: CopyDraft): Promise<void> {
  const signed = await signAs(requireActiveAccount(), copyTemplate(community, draft));
  await publishTagEvent(signed as never);
}

export async function withdrawOwnCopy(copy: ConceptDefinition): Promise<void> {
  const signed = await signAs(requireActiveAccount(), withdrawnTemplate(copy));
  await publishTagEvent(signed as never);
}
