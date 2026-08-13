import type React from "react";
import { useState } from "react";
import { Link } from "wouter";
import { Check, Loader2, Plus } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { npubFromPubkey } from "@/lib/shareId";
import { useApplyEventTag, useEventTags, usePickerTags } from "@/hooks/useTags";
import { stanceMenuRow } from "@/components/share/StanceControl";
import type { NoteTag } from "@/services/tags";

/**
 * What the network says a NOTE is about — rung C2, and the affordance Floor D
 * asks for wherever the app renders a note with actions.
 *
 * Deliberately the same shape as the profile chip row: chips link to their tag
 * page, and every stance lives in one popover rather than hanging a control off
 * each pill. Someone who has tagged a person already knows how this works.
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
  relayHint,
  canTag = false,
}: {
  eventId: string;
  /** Where the note actually lives, so readers can fetch it without us copying it. */
  relayHint?: string;
  /** The viewer is signed in AND holds a signer. A session token can't sign. */
  canTag?: boolean;
}) {
  const { data } = useEventTags(eventId);
  const tags = data?.tags ?? [];

  // Nothing to show and no way in — render nothing rather than an empty shell.
  if (!tags.length && !canTag) return null;

  return (
    <NoteTagRow tags={tags}>
      {canTag && <TagNoteButton eventId={eventId} relayHint={relayHint} onNote={tags} />}
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
        const who =
          tag.applications === 1 ? "1 person tagged this" : `${tag.applications} people tagged this`;
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
            className={[
              authorNpub ? "transition-opacity hover:opacity-80" : "",
              // Same rule as the profile chips: a tag you took back stays
              // visible and honest rather than vanishing.
              tag.counted ? "" : "opacity-50",
            ]
              .filter(Boolean)
              .join(" ") || undefined}
          >
            {tag.name}
            {tag.applications > 1 && (
              <span className="opacity-60 tabular-nums">{tag.applications}</span>
            )}
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
  relayHint,
  onNote,
}: {
  eventId: string;
  relayHint?: string;
  onNote: NoteTag[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const applyTag = useApplyEventTag(eventId, relayHint);
  // Only fetched once the picker is opened — no relay traffic for a button
  // nobody clicked.
  const { data: options } = usePickerTags(open);

  const taken = new Set(onNote.map((t) => t.name.toLowerCase()));

  // Content-applicable tags lead HERE, which is the mirror of the profile
  // picker's ordering and the reason the applicability split exists at all
  // (ACCEPTANCE C3). Usage still sorts within each band.
  const offered = (options ?? [])
    .filter((t) => !taken.has(t.name.toLowerCase()))
    .sort(
      (a, b) =>
        (a.band === b.band ? 0 : a.band === "content" ? -1 : 1) ||
        b.people - a.people ||
        a.name.localeCompare(b.name),
    );

  const typed = search.trim();
  const known = new Set([...taken, ...offered.map((t) => t.name.toLowerCase())]);
  const isNew = typed.length > 0 && !known.has(typed.toLowerCase());

  async function run(
    tag: { authorPubkey: string; slug: string } | { name: string },
    label: string,
    polarity: 1 | -1,
  ) {
    setOpen(false);
    setSearch("");
    try {
      const result = await applyTag.mutateAsync({ tag, polarity });
      // Up to three publishes and no atomicity. If the assertion didn't land we
      // must not claim it did — whatever did land is reusable, not a tagging.
      if (result.failedAt) {
        toast({
          title: "Couldn't finish tagging",
          description: "Part of it went through. Try again in a moment.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: polarity === 1 ? `Tagged as "${label}"` : `Disagreed with "${label}"`,
        description:
          polarity === 1
            ? "Anyone can see this on the post."
            : "Your agreement has been taken back.",
      });
    } catch {
      toast({
        title: "Couldn't tag this post",
        description: "Check your connection and try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-500 transition-colors hover:border-brand-primary hover:text-brand-primary dark:border-slate-600 dark:text-slate-400"
          data-testid="note-add-tag"
          disabled={applyTag.isPending}
        >
          {applyTag.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
          {applyTag.isPending ? "Saving" : "Tag this post"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command shouldFilter>
          <CommandInput
            placeholder="What is this post about?"
            value={search}
            onValueChange={setSearch}
            data-testid="note-tag-search"
          />
          <CommandList>
            {!isNew && <CommandEmpty>Type to add your own.</CommandEmpty>}

            {isNew && (
              <CommandGroup heading="Add your own">
                <CommandItem
                  value={typed}
                  onSelect={() => run({ name: typed }, typed, 1)}
                  data-testid="note-tag-create"
                >
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  {typed}
                </CommandItem>
              </CommandGroup>
            )}

            {/* Already on this post — where you say whether it fits. Two
                entries per tag rather than one toggle, for the reasons in
                StanceControl (#41 B2): a single toggle made agreeing the only
                thing reachable from neutral, and turned a second press into a
                permanent public disagreement. */}
            {onNote.length > 0 && (
              <CommandGroup heading="Already on this post">
                {onNote.flatMap((tag) => {
                  const row = stanceMenuRow(tag.myStance);
                  return ([row.agree, row.disagree] as const).map((choice) => {
                    const Icon = choice.icon;
                    return (
                      <CommandItem
                        key={`${tag.key}:${choice.polarity}`}
                        // cmdk filters on `value` — both entries need the tag's
                        // name or typing it would hide one of them.
                        value={`${tag.name} ${choice.hint}`}
                        onSelect={() =>
                          !choice.disabled &&
                          run(
                            { authorPubkey: tag.authorPubkey, slug: tag.slug },
                            tag.name,
                            choice.polarity,
                          )
                        }
                        className={choice.disabled ? "opacity-60" : ""}
                        data-testid="note-tag-stance"
                        data-polarity={choice.polarity}
                        data-current={choice.disabled ? "true" : "false"}
                      >
                        <Icon className={`mr-2 h-3.5 w-3.5 ${choice.iconClass}`} />
                        <span className="flex-1 truncate">{tag.name}</span>
                        <span className="ml-2 shrink-0 text-[10px] text-slate-400">
                          {choice.hint}
                        </span>
                      </CommandItem>
                    );
                  });
                })}
              </CommandGroup>
            )}

            {offered.length > 0 && (
              <CommandGroup heading="Tags people use">
                {offered.map((t) => (
                  <CommandItem
                    key={t.key}
                    value={t.name}
                    onSelect={() =>
                      run({ authorPubkey: t.authorPubkey, slug: t.slug }, t.name, 1)
                    }
                    data-testid="note-tag-existing"
                  >
                    <Plus className="mr-2 h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{t.name}</span>
                      {t.description && (
                        <span className="block truncate text-[10px] text-slate-400">
                          {t.description}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
