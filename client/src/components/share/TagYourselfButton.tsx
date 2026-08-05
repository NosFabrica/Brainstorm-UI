import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
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
import { resolveOrMintTag } from "@/services/tags";
import { useApplyTag, useProfileTags } from "@/hooks/useTags";

/**
 * "Add a tag" — the owner-only affordance beside their own tag chips.
 *
 * Scope is deliberately yourself-only for now. Tagging other people is the same
 * publish path with the owner check dropped, but it needs a dispute/report story
 * first, so the gate stays in the caller.
 *
 * The suggestion list is seeded from the same `ROLES` vocabulary as the "What
 * you do" editor, so the two feel like one product. That is the ONLY link
 * between them: nothing a user set under "What you do" is published here.
 * Adding a tag is always an explicit act, because unlike those private-ish
 * profile prefs, a tag is public and anyone can build on it.
 */
export function TagYourselfButton({ pubkey }: { pubkey: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const { data } = useProfileTags(pubkey);
  const applyTag = useApplyTag(pubkey);

  // Don't offer what's already on the profile.
  const taken = new Set((data?.tags ?? []).map((t) => t.name.toLowerCase()));
  const suggestions = ROLES.filter((r) => !taken.has(r.label.toLowerCase()));

  const typed = search.trim();
  const isNew =
    typed.length > 0 &&
    !suggestions.some((r) => r.label.toLowerCase() === typed.toLowerCase()) &&
    !taken.has(typed.toLowerCase());

  async function addTag(name: string) {
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
      toast({ title: `Added "${name}"`, description: "Others can see this on your profile." });
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
      <PopoverContent className="w-64 p-0" align="start">
        <Command shouldFilter>
          <CommandInput
            placeholder="What are you known for?"
            value={search}
            onValueChange={setSearch}
            data-testid="share-tag-search"
          />
          <CommandList>
            {!isNew && <CommandEmpty>Type to add your own.</CommandEmpty>}
            {isNew && (
              <CommandGroup heading="Add your own">
                {/* forceMount + a value that always matches the query, so this
                    row survives Command's own filtering of the list above. */}
                <CommandItem value={typed} onSelect={() => addTag(typed)} data-testid="share-tag-create">
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  {typed}
                </CommandItem>
              </CommandGroup>
            )}
            {suggestions.length > 0 && (
              <CommandGroup heading="Common tags">
                {suggestions.map((role) => (
                  <CommandItem
                    key={role.key}
                    value={role.label}
                    onSelect={() => addTag(role.label)}
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
