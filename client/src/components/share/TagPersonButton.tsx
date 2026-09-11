import { useState } from "react";
import { Plus, Check } from "lucide-react";
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
import { StanceRow } from "@/components/share/StanceControl";

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
 * counts against it. Never label this "Remove" — and never promise that one
 * disagreement stops the tag counting; the rule is applies minus disputes > 0,
 * so against several vouchers a single no changes nothing visible.
 */
export function TagPersonButton({
  pubkey,
  isOwner = false,
  legacyRoles = [],
  variant = "pill",
}: {
  pubkey: string;
  /** "pill": the dotted chip. "link": a quiet "+ Tag" beside other chips (the profile's Posts about row). */
  variant?: "pill" | "link";
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
  // A tag not yet on the profile asks first: what it is, and that it is
  // public and permanent. Agree/Disagree on existing tags stay one tap.
  const [pendingAdd, setPendingAdd] = useState<{ label: string; description?: string; run: () => Promise<void> } | null>(null);
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
  const offered = (options ?? [])
    .filter((t) => !offeredAbove.has(t.name.toLowerCase()))
    .map((t) => ({
      key: t.key,
      label: t.name,
      description: t.description,
      people: t.people,
      band: t.band,
      unverified: t.unverified,
      tag: { authorPubkey: t.authorPubkey, slug: t.slug },
    }));

  // The applicability split (ACCEPTANCE C3): tags that describe people lead,
  // tags the house says are for notes stay reachable but sit below. Ordering
  // WITHIN each band is by usage — never by the hint, which only 9 of 39 tags
  // carry and which buried the biggest real tag when we tried ranking on it.
  // `fetchPickerTags` already sorted; these keep that order.
  const vouched = offered.filter((t) => !t.unverified);
  const existing = vouched.filter((t) => t.band === "profile");
  const forNotes = vouched.filter((t) => t.band === "content");

  /**
   * Tags whose creator the network says nothing about — kept out of the
   * standing suggestions and surfaced only against something typed.
   *
   * The bug this fixes: `lfo` carries 54 people, more than every tag in the
   * suggestion list bar one, but its creator is unscored — so typing "LFO"
   * offered nothing and pushed you to "Create tag" for a tag that already
   * exists. `resolveOrMintTag` would have quietly reused the real element, so
   * no data was harmed; the user was just told a falsehood about what they
   * were doing.
   *
   * Capped, because ~840 of these exist and most are harness output. cmdk
   * still filters what we hand it; matching here is what keeps the DOM small.
   */
  const typedForMatch = search.trim().toLowerCase();
  const unverifiedMatches =
    typedForMatch.length >= 2
      ? offered
          .filter((t) => t.unverified && t.label.toLowerCase().includes(typedForMatch))
          .sort(
            (a, b) =>
              Number(b.label.toLowerCase() === typedForMatch) -
                Number(a.label.toLowerCase() === typedForMatch) || b.people - a.people,
          )
          .slice(0, 5)
      : [];

  const existingNames = new Set(offered.map((e) => e.label.toLowerCase()));
  const starters = ROLES.filter(
    (r) => !offeredAbove.has(r.label.toLowerCase()) && !existingNames.has(r.label.toLowerCase()),
  );

  const typed = search.trim();
  const known = new Set([
    ...offeredAbove,
    ...offered.map((e) => e.label.toLowerCase()),
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
        description: agreeing
          ? "Your vote is public."
          : "Your vote is public, and counts against this tag.",
      });
    } catch {
      toast({
        title: "Couldn't save that",
        description: "Check your connection and try again.",
        variant: "destructive",
      });
    }
  }

  /** Stage an add behind the confirm panel. */
  const confirmAdd = (label: string, run: () => Promise<void>, description?: string) => setPendingAdd({ label, description, run });

  /**
   * Apply a tag we already have coordinates for. Skips `resolveOrMintTag`
   * entirely — we picked this one off the catalogue, so there is nothing to
   * resolve and no chance of minting a duplicate by a name near-miss.
   */
  // The chip shows the moment you confirm (useApplyTag is optimistic) and so
  // does the word; the relays reconcile quietly, and only a failure speaks.
  const addedToast = (label: string) =>
    toast({
      title: `Added "${label}"`,
      description: isOwner ? "Others can see this on your profile." : "Anyone can see this on their profile.",
    });

  async function applyExisting(tag: { authorPubkey: string; slug: string }, label: string) {
    setOpen(false);
    setSearch("");
    addedToast(label);
    try {
      const result = await applyTag.mutateAsync({ tag, displayName: label });
      if (result.failedAt) {
        toast({
          title: `Couldn't add "${label}"`,
          description: "The relays did not take it. Give it another try in a moment.",
          variant: "destructive",
        });
        return;
      }
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
    addedToast(name);
    try {
      // Reuse the tag everyone else already uses when there is one, so counts
      // accumulate on a single tag instead of splitting across duplicates.
      const tag = await resolveOrMintTag(name);
      const result = await applyTag.mutateAsync({ tag, displayName: name });

      // Minting is two publishes and can't be atomic. If the second one failed
      // we must not claim success — the tag exists but nothing points at it.
      if (result.failedAt) {
        toast({
          title: `Couldn't finish adding "${name}"`,
          description: "The relays did not take it. Give it another try in a moment.",
          variant: "destructive",
        });
        return;
      }
    } catch {
      toast({
        title: "Couldn't add that tag",
        description: "Check your connection and try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setPendingAdd(null);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={
            variant === "link"
              ? "inline-flex items-center gap-0.5 text-[11px] font-semibold text-slate-400 transition-colors hover:text-brand-primary dark:text-slate-500"
              : "inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-500 transition-colors hover:border-brand-primary hover:text-brand-primary dark:border-slate-600 dark:text-slate-400"
          }
          data-testid="share-add-tag"
        >
          <Plus className="h-3 w-3" />
          {variant === "link" ? "Tag" : "Add a tag"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        {pendingAdd ? (
          <div className="p-3" data-testid="share-tag-confirm">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Add "{pendingAdd.label}"?</p>
            {pendingAdd.description && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{pendingAdd.description}</p>}
            <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {isOwner ? "Others can see this on your profile" : "Anyone can see this on their profile"}, and there is no delete — only disagreeing later.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingAdd(null)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                data-testid="share-tag-confirm-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const { run } = pendingAdd;
                  setPendingAdd(null);
                  void run();
                }}
                className="rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-primary-hover"
                data-testid="share-tag-confirm-add"
              >
                Add tag
              </button>
            </div>
          </div>
        ) : (
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
                <CommandItem value={typed} onSelect={() => confirmAdd(typed, () => addByName(typed))} data-testid="share-tag-create">
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  {typed}
                </CommandItem>
              </CommandGroup>
            )}

            {/* Already on this profile — where you say whether it fits. Listed
                first because reacting to what's there beats scrolling a generic
                list. One row per tag with Agree and Disagree side by side: both
                stances reachable from neutral, the one you hold shown as state,
                and no "Remove" — there is no delete (#41 B2). */}
            {onProfile.length > 0 && (
              <CommandGroup heading="Already on this profile">
                {onProfile.map((tag) => (
                  <StanceRow
                    key={tag.key}
                    name={tag.name}
                    stance={tag.myStance}
                    pending={applyTag.isPending}
                    onVote={(polarity) => void setStance(tag, polarity)}
                    testId="share-tag-stance"
                  />
                ))}
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
                    onSelect={() => confirmAdd(label, () => addByName(label))}
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
                    onSelect={() => confirmAdd(e.label, () => applyExisting(e.tag, e.label), e.description)}
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

            {/* Only ever shown against something typed — see the note on
                `unverifiedMatches`. Applying one of these joins the real,
                existing list instead of minting a duplicate of it. */}
            {unverifiedMatches.length > 0 && (
              <CommandGroup heading="Also called this">
                {unverifiedMatches.map((e) => (
                  <CommandItem
                    key={e.key}
                    value={e.label}
                    onSelect={() => confirmAdd(e.label, () => applyExisting(e.tag, e.label), e.description)}
                    data-testid="share-tag-unverified"
                  >
                    <Plus className="mr-2 h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{e.label}</span>
                      <span className="block truncate text-[10px] text-slate-400">
                        We don't know who made this tag
                      </span>
                    </span>
                    <span className="ml-2 shrink-0 text-[10px] tabular-nums text-slate-400">
                      {e.people}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* Tags the applicability split says describe posts rather than
                people. Still applicable — the hint is never a gate — just not
                what someone tagging a person is usually looking for. */}
            {forNotes.length > 0 && (
              <CommandGroup heading="Usually used on posts">
                {forNotes.map((e) => (
                  <CommandItem
                    key={e.key}
                    value={e.label}
                    onSelect={() => confirmAdd(e.label, () => applyExisting(e.tag, e.label), e.description)}
                    data-testid="share-tag-content"
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
                    onSelect={() => confirmAdd(role.label, () => addByName(role.label))}
                    data-testid="share-tag-option"
                  >
                    {role.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}
