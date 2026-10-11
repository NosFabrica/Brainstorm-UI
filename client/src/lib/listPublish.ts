/**
 * Publishing a definition together with the URL templates drafted for it
 * (lib/templateDrafts), in the order that never leaves a published list
 * pinning a template no relay has:
 *
 *   1. sign each new template — its id is now known;
 *   2. sign the header, its links naming those ids;
 *   3. publish the templates, stopping at the first that fails;
 *   4. publish the header.
 *
 * Everything is signed before anything is sent, so a signer that refuses
 * (or times out) leaves nothing behind. A failed send leaves at most some
 * templates published, which are items like any other on the URL Templates
 * list; the caller swaps each one into its draft as it lands
 * (`onTemplatePublished`), so it is an existing template from then on.
 *
 * A retry with the same session resends what was signed instead of asking
 * the signer again: an event is reused while what it says is unchanged, and
 * one already accepted isn't sent twice. An edit between attempts re-signs
 * only what it changed. Start a new session after a success.
 */
import type { NostrEvent } from "nostr-tools";
import type { CopyDraft, EventTemplate } from "@/lib/conceptCopy";
import { LINK_TAG } from "@/lib/linkTemplates";
import { resolveDraftTemplates, templateItem, templatesToPublish, type DraftTemplate } from "@/lib/templateDrafts";

export interface PublishSteps {
  sign: (template: EventTemplate) => Promise<NostrEvent>;
  publish: (event: NostrEvent) => Promise<void>;
}

export interface PublishSession {
  /** Signed events by what they say. */
  signed: Map<string, NostrEvent>;
  /** Ids of events a relay accepted. */
  sent: Set<string>;
}

export const newPublishSession = (): PublishSession => ({ signed: new Map(), sent: new Set() });

export type PublishProgress = {
  step: "sign" | "publish";
  what: "template" | "header";
  /** 1-based, among the new templates; absent for the header. */
  n?: number;
  of?: number;
};

const sayingOf = (t: EventTemplate) => JSON.stringify([t.kind, t.content, t.tags]);

export async function publishDefinition({
  draft,
  headerOf,
  steps,
  session = newPublishSession(),
  onProgress,
  onTemplatePublished,
}: {
  draft: CopyDraft;
  /** The header the draft publishes, once its links name real ids. */
  headerOf: (draft: CopyDraft) => EventTemplate;
  steps: PublishSteps;
  session?: PublishSession;
  onProgress?: (p: PublishProgress) => void;
  onTemplatePublished?: (draft: DraftTemplate, event: NostrEvent) => void;
}): Promise<{ header: NostrEvent; draft: CopyDraft }> {
  const signOnce = async (t: EventTemplate) => {
    const key = sayingOf(t);
    const known = session.signed.get(key);
    if (known) return known;
    const ev = await steps.sign(t);
    session.signed.set(key, ev);
    return ev;
  };

  const drafts = templatesToPublish(draft);
  const signed: [DraftTemplate, NostrEvent][] = [];
  for (const [i, t] of drafts.entries()) {
    onProgress?.({ step: "sign", what: "template", n: i + 1, of: drafts.length });
    signed.push([t, await signOnce(templateItem(t))]);
  }

  const resolved = resolveDraftTemplates(draft, new Map(signed.map(([t, ev]) => [t.id, ev.id])));
  const header = headerOf(resolved);
  // A stand-in id must never reach a relay: it names no event.
  const unpublished = new Set(resolved.templates.map((t) => t.id));
  if (header.tags.some((t) => t[0] === LINK_TAG && unpublished.has(t[1])))
    throw new Error("A link names a new URL template that isn't ready to publish.");
  onProgress?.({ step: "sign", what: "header" });
  const signedHeader = await signOnce(header);

  for (const [i, [t, ev]] of signed.entries()) {
    if (!session.sent.has(ev.id)) {
      onProgress?.({ step: "publish", what: "template", n: i + 1, of: signed.length });
      try {
        await steps.publish(ev);
      } catch (e) {
        const why = e instanceof Error ? e.message : String(e);
        throw new Error(`The new URL template "${t.name.trim()}" wasn't published, so neither was the list: ${why}`);
      }
      session.sent.add(ev.id);
    }
    onTemplatePublished?.(t, ev);
  }

  onProgress?.({ step: "publish", what: "header" });
  await steps.publish(signedHeader);
  session.sent.add(signedHeader.id);
  return { header: signedHeader, draft: resolved };
}

/** A progress report in words, for the publish button. */
export function progressLabel(p: PublishProgress | null): string {
  if (!p) return "Publishing…";
  const verb = p.step === "sign" ? "Signing" : "Publishing";
  if (p.what === "header") return `${verb} the list…`;
  return p.of && p.of > 1 ? `${verb} URL template ${p.n} of ${p.of}…` : `${verb} the URL template…`;
}
