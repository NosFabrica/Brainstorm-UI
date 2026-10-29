/**
 * "Add to my Dictionary" on a Dictionary entry: a line for the Dictionary the
 * reader's Brainstorm Assistant keeps, and one for their own. The Assistant is
 * the one Brainstorm hosts for them, whatever their Treasure Map gives
 * Concepts to — it's the copy item pages read (hooks/useItemConcept) — and
 * both lines show whichever Dictionary "Managed by" picked.
 *
 * Adding publishes an exact copy of the community's definition: the
 * Assistant's signed on the server (docs/dictionary/ASSISTANT-COPY-ASK.md),
 * the reader's in the browser (lib/conceptCopy `exactCopyTemplate`). Once a
 * line holds a copy it offers Remove, which republishes the copy as
 * withdrawn; the reader's own also offers Edit (OwnVersionDialog), and
 * outranks the Assistant's.
 */
import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { SectionHeader } from "@/components/ui/section-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OwnVersionDialog } from "@/components/dictionary/OwnVersionDialog";
import { apiClient, AssistantDictionaryUnavailableError, type AssistantDictionaryResult } from "@/services/api";
import { addOwnCopy, withdrawOwnCopy } from "@/services/conceptCopy";
import type { ConceptDefinition } from "@/lib/conceptResolution";
import type { DictionaryItem } from "@/services/dictionary";

type Keeper = "assistant" | "me";

/** What the server may answer and still have done what was asked. */
const DONE = new Set(["published", "updated", "unchanged", "withdrawn"]);

export function AddToDictionary({
  community,
  assistant,
  assistantHolds,
  ownCopy,
  nameOf,
  items,
}: {
  community: ConceptDefinition;
  /** The Assistant Brainstorm hosts for the reader, when they have one. */
  assistant: string | null;
  /** That Assistant holds a copy of this concept. */
  assistantHolds: boolean;
  /** The reader's own copy, when they hold one: what Edit starts from and Remove withdraws. */
  ownCopy: ConceptDefinition | null;
  nameOf: (pubkey: string) => string;
  /** The list's items: where Edit's "fields items carry" come from. */
  items: DictionaryItem[];
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<Keeper | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Keeper, string>>>({});
  // A server without the Assistant's routes: said once, and its button rests for the visit.
  const [unavailable, setUnavailable] = useState(false);
  const [removing, setRemoving] = useState<Keeper | null>(null);
  const [editing, setEditing] = useState(false);
  const name = assistant ? nameOf(assistant) : "";

  // Every read that resolves a concept: the Dictionary, item pages, admin's summary.
  const refresh = () =>
    Promise.all(
      ["dictionary", "item-concept", "admin/dictionary"].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );

  const run = async (keeper: Keeper, work: () => Promise<void>) => {
    if (busy) return;
    setBusy(keeper);
    setErrors((cur) => ({ ...cur, [keeper]: undefined }));
    try {
      await work();
      await refresh();
    } catch (e) {
      if (e instanceof AssistantDictionaryUnavailableError) setUnavailable(true);
      else setErrors((cur) => ({ ...cur, [keeper]: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(null);
      setRemoving(null);
    }
  };

  /** One of the Assistant's routes, for this concept: an answer that isn't done is its sentence. */
  const viaAssistant = (call: (concepts: string[]) => Promise<AssistantDictionaryResult>) => async () => {
    const result = (await call([community.coordinate])).concepts?.[0];
    if (!result || !DONE.has(result.status))
      throw new Error(
        result?.error || `Your Assistant couldn't change its Dictionary (${result?.status ?? "no answer"}).`,
      );
  };

  const add = (keeper: Keeper) =>
    run(
      keeper,
      keeper === "assistant" ? viaAssistant((c) => apiClient.addToAssistantDictionary(c)) : () => addOwnCopy(community),
    );
  const remove = (keeper: Keeper) =>
    run(
      keeper,
      keeper === "assistant"
        ? viaAssistant((c) => apiClient.removeFromAssistantDictionary(c))
        : async () => {
            if (ownCopy) await withdrawOwnCopy(ownCopy);
          },
    );

  const removeButton = (keeper: Keeper) => (
    <Button
      size="sm"
      variant="outline"
      onClick={() => setRemoving(keeper)}
      disabled={!!busy}
      data-testid={`dictionary-add-${keeper}-remove`}
    >
      Remove
    </Button>
  );

  return (
    <section className="space-y-3" data-testid="dictionary-add">
      <SectionHeader kicker="Add to my Dictionary" />
      <ul className="divide-y divide-border rounded-xl border border-border">
        <Line
          keeper="assistant"
          held={!!assistant && assistantHolds}
          heldLabel={`In ${name}'s Dictionary`}
          note={
            assistant
              ? `Recommended. ${name}, your Brainstorm Assistant, signs the copy.`
              : "Once you have a Brainstorm Assistant, it can keep this concept in your Dictionary."
          }
          add={
            assistant && (
              <Button
                size="sm"
                onClick={() => void add("assistant")}
                disabled={!!busy || unavailable}
                data-testid="dictionary-add-assistant-go"
              >
                {busy === "assistant" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Add to my Assistant's Dictionary"
                )}
              </Button>
            )
          }
          actions={removeButton("assistant")}
          notice={unavailable ? "Your Assistant can't add concepts on this server yet." : null}
          error={errors.assistant}
        />
        <Line
          keeper="me"
          held={!!ownCopy}
          heldLabel="In your own Dictionary"
          note="Signed with your own key. Yours outranks your Assistant's, and you can edit it."
          add={
            <Button
              size="sm"
              variant="outline"
              onClick={() => void add("me")}
              disabled={!!busy}
              data-testid="dictionary-add-me-go"
            >
              {busy === "me" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add to my own Dictionary"}
            </Button>
          }
          actions={
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(true)}
                disabled={!!busy}
                data-testid="dictionary-add-me-edit"
              >
                Edit
              </Button>
              {removeButton("me")}
            </>
          }
          error={errors.me}
        />
      </ul>

      <OwnVersionDialog
        open={editing}
        onOpenChange={setEditing}
        community={community}
        current={ownCopy}
        items={items}
        onPublished={() => void refresh()}
      />
      <ConfirmRemove
        open={removing === "assistant"}
        busy={!!busy}
        title={`Remove from ${name}'s Dictionary?`}
        onCancel={() => setRemoving(null)}
        onConfirm={() => void remove("assistant")}
      >
        {name} republishes its copy as &ldquo;considered, affiliated with none&rdquo; in place of its pointer to the
        community concept, so {community.plural} leaves its Dictionary.
      </ConfirmRemove>
      <ConfirmRemove
        open={removing === "me"}
        busy={!!busy}
        title="Remove from your own Dictionary?"
        onCancel={() => setRemoving(null)}
        onConfirm={() => void remove("me")}
      >
        Your copy is republished as &ldquo;considered, affiliated with none&rdquo; in place of its pointer to the
        community concept, so it no longer counts as a version of {community.plural}. You&rsquo;ll see your
        Assistant&rsquo;s version, or the community&rsquo;s, again.
      </ConfirmRemove>
    </section>
  );
}

/** One Dictionary's line: its Add button, or that the concept is in it and what can be done there. */
function Line({
  keeper,
  held,
  heldLabel,
  note,
  add,
  actions,
  notice,
  error,
}: {
  keeper: Keeper;
  held: boolean;
  heldLabel: string;
  /** Who signs the copy. */
  note: string;
  add: ReactNode;
  actions: ReactNode;
  /** That the server can't do this yet. */
  notice?: string | null;
  /** Why the last press didn't work. */
  error?: string | null;
}) {
  return (
    <li className="space-y-1.5 px-4 py-3" data-testid={`dictionary-add-${keeper}`}>
      {(held || add) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {held ? (
            <>
              <Chip tone="brand" icon={Check} data-testid={`dictionary-add-${keeper}-held`}>
                {heldLabel}
              </Chip>
              <div className="flex gap-2">{actions}</div>
            </>
          ) : (
            add
          )}
        </div>
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400">{note}</p>
      {notice && (
        <p className="text-xs text-amber-700 dark:text-amber-400" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

function ConfirmRemove({
  open,
  busy,
  title,
  onCancel,
  onConfirm,
  children,
}: {
  open: boolean;
  busy: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && !next && onCancel()}>
      <DialogContent className="sm:max-w-md" data-testid="dictionary-remove-confirm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{children}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={busy} data-testid="dictionary-remove-go">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
