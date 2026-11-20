import type React from "react";
import { useState } from "react";
import { Link } from "wouter";
import { ChevronRight, Loader2, Plus } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { signingProblem } from "@/accounts/signing";
import { npubFromPubkey } from "@/lib/shareId";
import { newTagValue, pickerTagScore } from "@/lib/tagMatch";
import { useApplyEventTag, useEventTags, usePickerTags } from "@/hooks/useTags";
import { SOFT_SELECTED_ROW, StanceRow } from "@/components/share/StanceControl";
import { TagConfirmPanel, type PendingTag } from "@/components/share/TagConfirmPanel";
import {
  TAG_SEARCH_PLACEHOLDER,
  UNFINISHED_TAGGING,
  UNSAVED_VOTE,
  ONLY_YOU_SEE_IT,
  onlyViewerSees,
  taggedToast,
  unconfirmedToast,
  voteToast,
} from "@/components/share/tagCopy";
import type { NoteTag } from "@/services/tags";
import type { KindEvent } from "@/lib/kindLabel";
import { taggableType, type ListNames } from "@/lib/taggable";

/** Re-exported for the callers that already import it from here. */
export { inSentence } from "@/lib/taggable";

/**
 * What the network says a NOTE is about — rung C2, and the affordance Floor D
 * asks for wherever the app renders a note with actions.
 *
 * Deliberately the same shape as the profile chip row: chips link to their tag
 * page, and every stance lives in one popover rather than hanging a control off
 * each pill. Someone who has tagged a person already knows how this works.
 *
 * Adding a tag asks first, through the same panel (TagConfirmPanel): a tag on
 * a post is as public and as permanent as one on a person, and a new tag is
 * named and described there.
 *
 * Two things differ from profile tagging, both from the protocol rather than
 * from taste:
 *
 *  - Applying a tag here can be up to three publishes (tag-element → tagging
 *    header → assertion), so the button shows real pending state and we don't
 *    paint an optimistic chip. See `useApplyEventTag`.
 *  - Tags that have never been applied to a note need their tagging header
 *    minted first. That happens automatically inside the SDK; the user just
 *    sees it take a moment longer.
 */
export function NoteTagChips({
  eventId,
  address,
  relayHint,
  canTag = false,
  item,
  list,
}: {
  eventId: string;
  /**
   * The event's coordinate, when it is addressable (`tagTargetOf`): its tags
   * are read and written by coordinate, so a tag survives its next edit (#334).
   */
  address?: string;
  /** Where the note actually lives, so readers can fetch it without us copying it. */
  relayHint?: string;
  /** The viewer is signed in AND holds a signer. A session token can't sign. */
  canTag?: boolean;
  /**
   * The event being tagged, so the button, the picker and the toast name it as
   * what it is: "Tag this issue", "Tag this repo" (lib/taggable). A post when
   * not given.
   */
  item?: KindEvent;
  /** What the item's Dictionary list calls its items, when it is one: "GitHub Account". */
  list?: ListNames | null;
}) {
  const { data } = useEventTags(eventId, address);
  const tags = data?.tags ?? [];

  // Nothing to show and no way in — render nothing rather than an empty shell.
  if (!tags.length && !canTag) return null;

  return (
    <NoteTagRow tags={tags}>
      {canTag && (
        <TagNoteButton
          eventId={eventId}
          address={address}
          relayHint={relayHint}
          onNote={tags}
          noun={item ? taggableType(item, list).noun : "post"}
        />
      )}
    </NoteTagRow>
  );
}

/**
 * The chips alone, given tags someone else already fetched.
 *
 * Exists because a page rendering several notes must not have each of them
 * open its own relay subscription — ACCEPTANCE C2 requires one batched `#e`
 * query for a list of notes, not a REQ per note. `SharePage` reads the whole
 * page's worth through `useEventTagsBatch` and hands each card its slice.
 */
export function NoteTagRow({
  tags,
  children,
}: {
  tags: NoteTag[];
  /** Optional trailing control — the picker, where one belongs. */
  children?: React.ReactNode;
}) {
  if (!tags.length && !children) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5" data-testid="note-tags">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Tagged as
      </span>

      {tags.map((tag) => {
        const who = onlyViewerSees(tag)
          ? ONLY_YOU_SEE_IT
          : tag.applications === 1
            ? "1 person tagged this"
            : `${tag.applications} people tagged this`;
        let authorNpub = "";
        try {
          authorNpub = npubFromPubkey(tag.authorPubkey);
        } catch {
          /* unlinkable */
        }

        const chip = (
          <Chip
            key={tag.key}
            tone={tag.myStance === "apply" ? "accent" : "brand"}
            title={tag.description ? `${who} — ${tag.description}` : who}
            data-testid="note-tag-chip"
            data-counted={tag.counted ? "true" : "false"}
            className={
              [
                authorNpub ? "transition-opacity hover:opacity-80" : "",
                // Same rule as the profile chips: a tag you took back stays
                // visible and honest rather than vanishing.
                tag.counted ? "" : "opacity-50",
              ]
                .filter(Boolean)
                .join(" ") || undefined
            }
          >
            {tag.name}
            {tag.applications > 1 && <span className="tabular-nums opacity-60">{tag.applications}</span>}
          </Chip>
        );

        return authorNpub ? (
          <Link key={tag.key} href={`/tags/${authorNpub}/${tag.slug}`}>
            {chip}
          </Link>
        ) : (
          chip
        );
      })}

      {children}
    </div>
  );
}

/** The picker. Same vocabulary and ordering as the profile one. */
function TagNoteButton({
  eventId,
  address,
  relayHint,
  onNote,
  noun,
}: {
  eventId: string;
  address?: string;
  relayHint?: string;
  onNote: NoteTag[];
  /** What the event is called mid-sentence: "post", "GitHub account". */
  noun: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  // A tag not yet on it asks first; Agree/Disagree on the tags already there stay one tap.
  const [pending, setPending] = useState<{
    tag: PendingTag;
    /** An existing tag's coordinates; a new one is named in the panel. */
    coords?: { authorPubkey: string; slug: string };
  } | null>(null);
  const { toast } = useToast();
  const applyTag = useApplyEventTag(eventId, relayHint, address ? { address } : undefined);
  // Only fetched once the picker is opened — no relay traffic for a button
  // nobody clicked.
  const { data: options, isPending: loadingTags } = usePickerTags(open);

  const taken = new Set(onNote.map((t) => t.name.toLowerCase()));

  // Content-applicable tags lead HERE, which is the mirror of the profile
  // picker's ordering and the reason the applicability split exists at all
  // (ACCEPTANCE C3); tags mostly put on people follow under their own heading.
  // `fetchPickerTags` already sorted each band by usage.
  const offered = (options ?? []).filter((t) => !taken.has(t.name.toLowerCase()));
  // As in the person picker (TagPersonButton): a tag whose creator is unscored
  // stays out of the suggestions — the hub holds QA harness output — and joins
  // them only against two or more letters typed.
  const typedForMatch = search.trim().toLowerCase();
  const shown = offered.filter(
    (t) => !t.unverified || (typedForMatch.length >= 2 && t.name.toLowerCase().includes(typedForMatch)),
  );
  const forPosts = shown.filter((t) => t.band === "content");
  const forPeople = shown.filter((t) => t.band === "profile");

  const typed = search.trim();
  const known = new Set([...taken, ...offered.map((t) => t.name.toLowerCase())]);
  // Not before the tags people use are in: a new tag over a name that
  // exists would make a second tag of it (the list takes ~5 s to come).
  const isNew = !loadingTags && typed.length > 0 && !known.has(typed.toLowerCase());

  const confirmExisting = (t: { authorPubkey: string; slug: string; name: string; description?: string }) =>
    setPending({
      tag: { kind: "existing", label: t.name, description: t.description },
      coords: { authorPubkey: t.authorPubkey, slug: t.slug },
    });

  /**
   * Publish a tagging. `vote` is a stance on a tag already on it (Agree,
   * Disagree); without it this is adding a tag, and the words say which
   * (components/share/tagCopy).
   */
  async function run(
    tag: { authorPubkey: string; slug: string } | { name: string; description?: string },
    label: string,
    polarity: 1 | -1,
    vote = false,
  ) {
    setOpen(false);
    setSearch("");
    try {
      const result = await applyTag.mutateAsync({ tag, polarity });
      // Up to three publishes and no atomicity. If the assertion didn't land we
      // must not claim it did — whatever did land is reusable, not a tagging.
      if (result.failedAt) {
        toast(vote ? UNSAVED_VOTE : UNFINISHED_TAGGING);
        return;
      }
      // Accepted, and not there when read back: neither tagged nor failed.
      if (result.confirmed === false) {
        toast(unconfirmedToast(label, vote));
        return;
      }
      toast(vote ? voteToast(label, polarity === 1) : taggedToast(label, `Anyone can see this on the ${noun}`));
    } catch (error) {
      const description = signingProblem(error, "Check your connection and try again.");
      if (!description) return;
      toast(
        vote
          ? { ...UNSAVED_VOTE, description }
          : { title: `Couldn't tag this ${noun}`, description, variant: "destructive" },
      );
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setPending(null);
          // Each opening starts from the whole list, not what was last typed.
          setSearch("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-500 transition-colors hover:border-brand-primary hover:text-brand-primary dark:border-slate-600 dark:text-slate-400"
          data-testid="note-add-tag"
          disabled={applyTag.isPending}
        >
          {applyTag.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          {applyTag.isPending ? "Saving" : `Tag this ${noun}`}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        {pending ? (
          <TagConfirmPanel
            pending={pending.tag}
            target={`this ${noun}`}
            reach={`Anyone can see this on the ${noun}`}
            known={offered.map((t) => ({ label: t.name, description: t.description }))}
            testId="note-tag"
            onCancel={() => setPending(null)}
            onConfirm={(decision) => {
              const { tag, coords } = pending;
              setPending(null);
              if (decision.kind === "new") {
                void run({ name: decision.name, description: decision.description }, decision.name, 1);
              } else if (decision.kind === "match") {
                // The name they typed is a tag people use: add that one, by its coordinates.
                const found = offered.find((t) => t.name === decision.label);
                if (found) void run({ authorPubkey: found.authorPubkey, slug: found.slug }, found.name, 1);
              } else if (coords && tag.kind === "existing") void run(coords, tag.label, 1);
            }}
          />
        ) : (
          <Command shouldFilter filter={pickerTagScore}>
            <CommandInput
              placeholder={TAG_SEARCH_PLACEHOLDER}
              value={search}
              onValueChange={setSearch}
              data-testid="note-tag-search"
            />
            <CommandList>
              {loadingTags ? (
                <div className="px-3 py-2 text-xs text-slate-400" data-testid="note-tag-loading">
                  Loading tags…
                </div>
              ) : (
                !isNew && <CommandEmpty>Type a name to create a new tag.</CommandEmpty>
              )}

              {/* Already on it — where you say whether it fits. One row
                per tag with Agree and Disagree side by side (StanceRow), for
                the reasons in StanceControl. */}
              {onNote.length > 0 && (
                <CommandGroup heading={`Already on this ${noun}`}>
                  {onNote.map((tag) => (
                    <StanceRow
                      key={tag.key}
                      name={tag.name}
                      stance={tag.myStance}
                      pending={applyTag.isPending}
                      onVote={(polarity) =>
                        void run({ authorPubkey: tag.authorPubkey, slug: tag.slug }, tag.name, polarity, true)
                      }
                      testId="note-tag-stance"
                    />
                  ))}
                </CommandGroup>
              )}

              {forPosts.length > 0 && (
                <CommandGroup heading="Tags people use">
                  {forPosts.map((t) => (
                    <CommandItem
                      key={t.key}
                      value={t.name}
                      onSelect={() => confirmExisting(t)}
                      className={SOFT_SELECTED_ROW}
                      data-testid="note-tag-existing"
                    >
                      <Plus className="mr-2 h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{t.name}</span>
                        {t.description && (
                          <span className="block truncate text-[10px] text-slate-400">{t.description}</span>
                        )}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {/* Tags mostly put on people. Still offered — the hint is never a
                gate — just not what someone tagging a post or an item usually wants. */}
              {forPeople.length > 0 && (
                <CommandGroup heading="Usually used on people">
                  {forPeople.map((t) => (
                    <CommandItem
                      key={t.key}
                      value={t.name}
                      onSelect={() => confirmExisting(t)}
                      className={SOFT_SELECTED_ROW}
                      data-testid="note-tag-for-people"
                    >
                      <Plus className="mr-2 h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{t.name}</span>
                        {t.description && (
                          <span className="block truncate text-[10px] text-slate-400">{t.description}</span>
                        )}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {/* Last: an existing tag above it is what Enter takes (pickerTagScore). */}
              {isNew && (
                <CommandGroup heading="New tag">
                  {/* Says what comes next: this opens the form, it publishes nothing. */}
                  <CommandItem
                    value={newTagValue(typed)}
                    onSelect={() => setPending({ tag: { kind: "new", name: typed } })}
                    className={SOFT_SELECTED_ROW}
                    data-testid="note-tag-create"
                  >
                    <Plus className="mr-2 h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">Create "{typed}"</span>
                      <span className="block truncate text-[10px] text-slate-400">Add a description next</span>
                    </span>
                    <ChevronRight className="ml-2 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}
