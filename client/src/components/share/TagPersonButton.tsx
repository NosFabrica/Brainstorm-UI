import { useState } from "react";
import { Plus, Loader2, Check } from "lucide-react";
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
import { ROLES } from "@/config/personalization";
import { resolveOrMintTag, type ProfileTag } from "@/services/tags";
import { useApplyTag, useProfileTags, usePickerTags } from "@/hooks/useTags";

/**
 * Add a tag to a person — your own profile or anyone else's.
 *
 * Any signed-in viewer with a signer can tag any profile; owner vs visitor
 * differs only in copy. Note the gate is a SIGNER, not a session: a session
 * token is backend auth and cannot sign an event, so `signEventLocally` would
 * throw and the affordance would be a lie.
 *
 * Every stance lives in this one popover rather than on the chips themselves.
 * The chips are links to their tag pages, and hanging a second control off each
 * one would put two tap targets inside a pill on mobile. One surface, one place
 * to look.
 *
 * The suggestion list is seeded from the same `ROLES` vocabulary as the "What
 * you do" editor, so the two feel like one product. That is the ONLY link
 * between them: nothing a user set under "What you do" is published here.
 *
 * On disagreeing: the protocol has no delete. An assertion is replaced by
 * re-publishing the same deterministic `d` tag with the opposite polarity, so
 * the honest word is "Disagree" — the old assertion is still on relays, it just
 * stops counting. Never label this "Remove".
 */
export function TagPersonButton({
  pubkey,
  isOwner = false,
  legacyRoles = [],
}: {
  pubkey: string;
  /** Only changes wording — the permission is the same either way. */
  isOwner?: boolean;
  /**
   * Labels this person previously self-declared under the retired "What you do"
   * editor. Offered as one-tap tags so a signal they already gave us isn't
   * simply deleted — but only ever offered. Publishing them automatically would
   * push private-ish profile settings to a public hub without asking.
   */
  legacyRoles?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const { data } = useProfileTags(pubkey);
  const applyTag = useApplyTag(pubkey);
  // Loads only once the picker has been opened — no relay traffic for a button
  // nobody clicked. Cached hard afterwards.
  const { data: options } = usePickerTags(open);

  const onProfile = data?.tags ?? [];
  const taken = new Set(onProfile.map((t) => t.name.toLowerCase()));
  // Old roles that aren't already tags. Once added, they drop off this list on
  // their own — no dismiss state to store.
  const pendingLegacy = isOwner ? legacyRoles.filter((r) => !taken.has(r.toLowerCase())) : [];
  // Anything offered above as a previously-listed role must not also appear in
  // the generic list — the same word twice in one menu reads as a bug.
  const offeredAbove = new Set([...taken, ...pendingLegacy.map((r) => r.toLowerCase())]);

  /**
   * Real tags people already use, most-used first, then the starter vocabulary
   * for anything nobody has minted yet.
   *
   * This list used to be `ROLES` alone — twelve hardcoded words while 39 real
   * tags existed on the hub. Nobody could apply "Bitcoin Vendor" without typing
   * it exactly, and a near-miss minted a duplicate instead.
   */
  const existing = (options ?? [])
    .filter((t) => !offeredAbove.has(t.name.toLowerCase()))
    .map((t) => ({
      key: t.key,
      label: t.name,
      description: t.description,
      people: t.people,
      tag: { authorPubkey: t.authorPubkey, slug: t.slug },
    }))
    // Most-used first. `fetchPickerTags` already puts the never-used hinted
    // tags last, and they sort there naturally at zero.
    .sort((a, b) => b.people - a.people || a.label.localeCompare(b.label));

  const existingNames = new Set(existing.map((e) => e.label.toLowerCase()));
  const starters = ROLES.filter(
    (r) => !offeredAbove.has(r.label.toLowerCase()) && !existingNames.has(r.label.toLowerCase()),
  );

  const typed = search.trim();
  const known = new Set([
    ...offeredAbove,
    ...existing.map((e) => e.label.toLowerCase()),
    ...starters.map((s) => s.label.toLowerCase()),
  ]);
  const isNew = typed.length > 0 && !known.has(typed.toLowerCase());

  /** Agree with, or take back your agreement from, a tag already on the profile. */
  async function setStance(tag: ProfileTag, polarity: 1 | -1) {
    setOpen(false);
    setSearch("");
    const agreeing = polarity === 1;
    try {
      const result = await applyTag.mutateAsync({
        tag: { authorPubkey: tag.authorPubkey, slug: tag.slug },
        polarity,
        displayName: tag.name,
      });
      if (result.failedAt) {
        toast({
          title: "Couldn't save that",
          description: "Give it another try in a moment.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: agreeing ? `You agree with "${tag.name}"` : `You disagreed with "${tag.name}"`,
        description: agreeing ? "Your vote is public." : "It stops counting toward this tag.",
      });
    } catch {
      toast({
        title: "Couldn't save that",
        description: "Check your connection and try again.",
        variant: "destructive",
      });
    }
  }

  /**
   * Apply a tag we already have coordinates for. Skips `resolveOrMintTag`
   * entirely — we picked this one off the catalogue, so there is nothing to
   * resolve and no chance of minting a duplicate by a name near-miss.
   */
  async function applyExisting(tag: { authorPubkey: string; slug: string }, label: string) {
    setOpen(false);
    setSearch("");
    try {
      const result = await applyTag.mutateAsync({ tag, displayName: label });
      if (result.failedAt) {
        toast({
          title: "Couldn't add that tag",
          description: "Give it another try in a moment.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: `Added "${label}"`,
        description: isOwner
          ? "Others can see this on your profile."
          : "Anyone can see this on their profile.",
      });
    } catch {
      toast({
        title: "Couldn't add that tag",
        description: "Check your connection and try again.",
        variant: "destructive",
      });
    }
  }

  /** Add a tag by name — reusing the shared one when it already exists. */
  async function addByName(name: string) {
    setOpen(false);
    setSearch("");
    try {
      // Reuse the tag everyone else already uses when there is one, so counts
      // accumulate on a single tag instead of splitting across duplicates.
      const tag = await resolveOrMintTag(name);
      const result = await applyTag.mutateAsync({ tag, displayName: name });

      // Minting is two publishes and can't be atomic. If the second one failed
      // we must not claim success — the tag exists but nothing points at it.
      if (result.failedAt) {
        toast({
          title: "Couldn't finish adding that tag",
          description: "Give it another try in a moment.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: `Added "${name}"`,
        description: isOwner
          ? "Others can see this on your profile."
          : "Anyone can see this on their profile.",
      });
    } catch {
      toast({
        title: "Couldn't add that tag",
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
          data-testid="share-add-tag"
          disabled={applyTag.isPending}
        >
          {applyTag.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
          Add a tag
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command shouldFilter>
          <CommandInput
            placeholder={isOwner ? "What are you known for?" : "What are they known for?"}
            value={search}
            onValueChange={setSearch}
            data-testid="share-tag-search"
          />
          <CommandList>
            {!isNew && <CommandEmpty>Type to add your own.</CommandEmpty>}

            {isNew && (
              <CommandGroup heading="Add your own">
                <CommandItem value={typed} onSelect={() => addByName(typed)} data-testid="share-tag-create">
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  {typed}
                </CommandItem>
              </CommandGroup>
            )}

            {/* Already on this profile — where you agree, or take your agreement
                back. Listed first because reacting to what's there beats
                scrolling a generic list. */}
            {onProfile.length > 0 && (
              <CommandGroup heading="Already on this profile">
                {onProfile.map((tag) => {
                  const agreed = tag.myStance === "apply";
                  return (
                    <CommandItem
                      key={tag.key}
                      value={tag.name}
                      onSelect={() => setStance(tag, agreed ? -1 : 1)}
                      data-testid="share-tag-stance"
                    >
                      {agreed ? (
                        <Check className="mr-2 h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Plus className="mr-2 h-3.5 w-3.5" />
                      )}
                      <span className="flex-1 truncate">{tag.name}</span>
                      <span className="ml-2 shrink-0 text-[10px] text-slate-400">
                        {agreed ? "Disagree" : "Agree"}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {/* Roles this person listed before tags existed. Shown to them
                only, and only until they've added them — a nudge, not a
                migration that happens behind their back. */}
            {isOwner && pendingLegacy.length > 0 && (
              <CommandGroup heading="You listed these before">
                {pendingLegacy.map((label) => (
                  <CommandItem
                    key={label}
                    value={label}
                    onSelect={() => addByName(label)}
                    data-testid="share-tag-legacy"
                  >
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    <span className="flex-1 truncate">{label}</span>
                    <span className="ml-2 shrink-0 text-[10px] text-slate-400">Add as tag</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* Real tags people already use. Applying one of these joins an
                existing list rather than minting a near-duplicate. */}
            {existing.length > 0 && (
              <CommandGroup heading="Tags people use">
                {existing.map((e) => (
                  <CommandItem
                    key={e.key}
                    value={e.label}
                    onSelect={() => applyExisting(e.tag, e.label)}
                    data-testid="share-tag-existing"
                  >
                    <Plus className="mr-2 h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{e.label}</span>
                      {e.description && (
                        <span className="block truncate text-[10px] text-slate-400">{e.description}</span>
                      )}
                    </span>
                    <span className="ml-2 shrink-0 text-[10px] tabular-nums text-slate-400">
                      {e.people}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {starters.length > 0 && (
              <CommandGroup heading="Common tags">
                {starters.map((role) => (
                  <CommandItem
                    key={role.key}
                    value={role.label}
                    onSelect={() => addByName(role.label)}
                    data-testid="share-tag-option"
                  >
                    {role.label}
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
