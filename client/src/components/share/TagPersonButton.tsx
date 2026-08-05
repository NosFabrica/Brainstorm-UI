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
import { useApplyTag, useProfileTags } from "@/hooks/useTags";

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
}: {
  pubkey: string;
  /** Only changes wording — the permission is the same either way. */
  isOwner?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const { data } = useProfileTags(pubkey);
  const applyTag = useApplyTag(pubkey);

  const onProfile = data?.tags ?? [];
  const taken = new Set(onProfile.map((t) => t.name.toLowerCase()));
  const suggestions = ROLES.filter((r) => !taken.has(r.label.toLowerCase()));

  const typed = search.trim();
  const isNew =
    typed.length > 0 &&
    !suggestions.some((r) => r.label.toLowerCase() === typed.toLowerCase()) &&
    !taken.has(typed.toLowerCase());

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

            {suggestions.length > 0 && (
              <CommandGroup heading="Common tags">
                {suggestions.map((role) => (
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
