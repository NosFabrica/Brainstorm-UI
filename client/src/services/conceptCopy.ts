/**
 * Adding, editing and withdrawing the reader's own version of a concept
 * (lib/conceptCopy) — signed by the Active Account, sent where tags go: the
 * tag hub, where concepts are read, and the author's own write relays
 * (services/tags `publishTagEvent`). Withdrawing is a replacement marked
 * `b-tag-deferred`, not a NIP-09 deletion (lib/conceptCopy says why).
 *
 * URL templates drafted for an edited copy are published first, the copy's
 * links naming their ids (lib/listPublish). An exact copy drafts none.
 */
import { requireActiveAccount, signAs } from "@/accounts/signing";
import { publishTagEvent } from "@/services/tags";
import { copyTemplate, exactCopyTemplate, withdrawnTemplate, type CopyDraft } from "@/lib/conceptCopy";
import type { ConceptDefinition } from "@/lib/conceptResolution";
import { publishDefinition } from "@/lib/listPublish";
import { listPublishSteps } from "@/services/lists";

export async function publishOwnCopy(
  community: ConceptDefinition,
  draft: CopyDraft,
  opts: Pick<Parameters<typeof publishDefinition>[0], "session" | "onProgress" | "onTemplatePublished"> = {},
): Promise<void> {
  await publishDefinition({
    draft,
    headerOf: (resolved) => copyTemplate(community, resolved),
    steps: listPublishSteps,
    ...opts,
  });
}

/** "Add to my own Dictionary": the community's definition, exactly, under the reader's key. */
export async function addOwnCopy(community: ConceptDefinition): Promise<void> {
  const signed = await signAs(requireActiveAccount(), exactCopyTemplate(community));
  await publishTagEvent(signed as never);
}

export async function withdrawOwnCopy(copy: ConceptDefinition): Promise<void> {
  const signed = await signAs(requireActiveAccount(), withdrawnTemplate(copy));
  await publishTagEvent(signed as never);
}
