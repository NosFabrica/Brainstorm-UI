/**
 * Settings › Dictionary — the concepts Brainstorm understands for the
 * reader. A concept is in their Dictionary when they, or their Tapestry
 * Assistant, hold a copy of a community concept: a header of their own
 * pointing at it with a `b` tag (services/dictionary). Which concepts are
 * shown at all is config/dictionary — two to start, GitHub Accounts and
 * URLs (2026-10-01). The ones the community shares that aren't in it yet
 * wait in a panel below, closed until the reader opens it (2026-10-27).
 *
 * Everything shown is the governing definition (lib/conceptResolution): the
 * reader's copy when they have one, with the community concept beside it
 * and whether the two agree. Copies can't be edited yet, so they all agree;
 * the page is already drawing from the copy for the day they can.
 *
 * `?concept=<coordinate>` opens one entry: its fields, where the definition
 * comes from, and its items, drawn by DListItemRow from the same view as an
 * item's page, card and popup row.
 *
 * Items count and show only from authors in the reader's web of trust —
 * ranked at the verified line or above, from the active Perspective
 * (services/wotRanks). The rest are a count, shown on request, never mixed in.
 *
 * "Managed by" says whose Dictionary it is: the reader's own copies, one of
 * their Assistants', or all their Assistants' together — by default the one
 * their Treasure Map gives Concept headers to, else their local Assistant
 * (lib/managedDictionary). `?managedBy=me|all|<npub>` names another, and an
 * entry opened from the list keeps it. The choice is this page's alone: item
 * pages and search resolve a concept as they always have.
 */
import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { ArrowLeft, BookOpen, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { SectionHeader } from "@/components/ui/section-header";
import { AgreementChip } from "@/components/dictionary/AgreementChip";
import { ManagedByPicker, managerName } from "@/components/dictionary/ManagedByPicker";
import { OwnVersionDialog } from "@/components/dictionary/OwnVersionDialog";
import { ListManager, listManagerPath } from "@/components/lists/ListManager";
import { DListItemRow } from "@/components/dictionary/DListItemRow";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { withdrawOwnCopy } from "@/services/conceptCopy";
import { useDictionary } from "@/hooks/useDictionary";
import { useDictionaryManagers } from "@/hooks/useDictionaryManagers";
import { useDictionaryReader } from "@/hooks/useDictionaryReader";
import { useLiveProfile } from "@/hooks/useLiveProfile";
import { useWotItems } from "@/hooks/useWotItems";
import { useConceptItems } from "@/hooks/useConceptItems";
import { useNearViewport } from "@/hooks/useNearViewport";
import { dictionaryRelays } from "@/config/dictionary";
import { DISPLAY_ROLES, FACT_ROLE, type DisplayHints } from "@/lib/displayHints";
import type { LinkRef } from "@/lib/linkTemplates";
import { useLinkTemplates } from "@/hooks/useLinkTemplates";
import { avatarSrc } from "@/lib/avatarSrc";
import { parseCoordinate, type FieldDecl } from "@/lib/dlistFields";
import { filterItems, ITEM_ORDERS, sortItems, type ItemOrder } from "@/lib/dictionaryItems";
import {
  ALL,
  ME,
  MANAGED_BY_PARAM,
  assistantOptions,
  defaultChoice,
  managedByParam,
  managedEntries,
  parseManagedBy,
  type ManagedEntry,
} from "@/lib/managedDictionary";
import {
  definitionOf,
  type ConceptDefinition,
  type DefinitionSource,
  type ResolvedConcept,
} from "@/lib/conceptResolution";
import type { DictionaryItem } from "@/services/dictionary";

export const dictionaryEntryPath = (coordinate: string) =>
  `/settings?tab=dictionary&concept=${encodeURIComponent(coordinate)}`;

/** Whose Dictionary a page shows, and how to name them. */
interface Manager {
  choice: string;
  nameOf: (pubkey: string) => string;
  /** The reader has an Assistant at all: who else would add a concept. */
  hasAssistants: boolean;
}

export function DictionaryTab() {
  const params = new URLSearchParams(useSearch());
  const [, navigate] = useLocation();
  const concept = params.get("concept");
  const asked = params.get(MANAGED_BY_PARAM);
  const { pubkey } = useDictionaryReader();
  const managers = useDictionaryManagers(pubkey);
  const dictionary = useDictionary(true, { managers: managers.pubkeys });
  const { choice, unknown } = parseManagedBy(asked, managers.options);
  const entries = useMemo(
    () => managedEntries(dictionary.data ?? [], choice, managers.options),
    [dictionary.data, choice, managers.options],
  );
  // Closed until the reader opens it, and kept while they visit an entry and come back.
  const [communityOpen, setCommunityOpen] = useState(false);
  const manager: Manager = {
    choice,
    nameOf: managers.nameOf,
    hasAssistants: assistantOptions(managers.options).length > 0,
  };
  // An entry opened from the list, and the way back, keep the choice the URL named.
  const keep = (path: string) => (asked ? `${path}&${MANAGED_BY_PARAM}=${encodeURIComponent(asked)}` : path);

  if (params.get("manage") === "lists") return <ListManager />;

  if (concept) {
    const entry = entries.find((e) => e.communityCoordinate === concept);
    return (
      <DictionaryEntryView
        coordinate={concept}
        entry={entry}
        loading={dictionary.isPending}
        manager={manager}
        me={pubkey}
        backHref={keep("/settings?tab=dictionary")}
      />
    );
  }

  const pick = (key: string) => {
    const next = new URLSearchParams(params);
    if (key === defaultChoice(managers.options)) next.delete(MANAGED_BY_PARAM);
    else next.set(MANAGED_BY_PARAM, managedByParam(key));
    navigate(`/settings?${next}`);
  };

  const mine = entries.filter((e) => e.inDictionary);
  const available = entries.filter((e) => !e.inDictionary && e.resolved);

  return (
    <Card className="overflow-hidden" data-testid="card-dictionary">
      <CardHead
        title="Your Dictionary"
        subtitle="The concepts Brainstorm understands for you — what a GitHub account is, which details it has, how it shows up."
      />
      <div className="space-y-6 p-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {pubkey ? (
              <ManagedByPicker
                options={managers.options}
                choice={choice}
                settled={managers.settled}
                profiles={managers.profiles}
                nameOf={managers.nameOf}
                onPick={pick}
              />
            ) : (
              <span />
            )}
            <Button asChild variant="outline" size="sm">
              <Link href={listManagerPath()} data-testid="dictionary-list-management">
                List Management
              </Link>
            </Button>
          </div>
          {unknown && managers.settled && (
            <p
              className="text-xs text-amber-700 dark:text-amber-400"
              role="status"
              data-testid="dictionary-managed-unknown"
            >
              The link names someone who isn&rsquo;t one of your Assistants, so this is{" "}
              {choice === ME ? "your own Dictionary" : `${managerName(choice, managers.nameOf)}’s Dictionary`}.
            </p>
          )}
        </div>
        {dictionary.isPending ? (
          <Pending label="Reading your Dictionary…" />
        ) : (
          <>
            <section className="space-y-3" data-testid="dictionary-mine">
              <SectionHeader kicker="In your Dictionary" />
              {mine.length ? (
                <ul className="space-y-2">
                  {mine.map((e) => (
                    <ConceptRow
                      key={e.communityCoordinate}
                      entry={e}
                      manager={manager}
                      href={keep(dictionaryEntryPath(e.communityCoordinate))}
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="dictionary-empty">
                  {emptyText(manager)}
                </p>
              )}
            </section>
            {available.length > 0 && (
              <section className="overflow-hidden rounded-xl border border-border" data-testid="dictionary-available">
                <button
                  type="button"
                  onClick={() => setCommunityOpen((v) => !v)}
                  aria-expanded={communityOpen}
                  className={`flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-accent/40 dark:hover:bg-slate-800/60 ${communityOpen ? "border-b border-border" : ""}`}
                  data-testid="dictionary-available-toggle"
                >
                  <SectionHeader kicker={`Shared by the community · ${available.length}`} noRule className="flex-1" />
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${communityOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {communityOpen && (
                  <ul className="space-y-2 p-3">
                    {available.map((e) => (
                      <ConceptRow
                        key={e.communityCoordinate}
                        entry={e}
                        manager={manager}
                        href={keep(dictionaryEntryPath(e.communityCoordinate))}
                      />
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function CardHead({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-border bg-slate-50 px-5 py-4 dark:bg-slate-900">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
        <BookOpen className="h-4 w-4 text-brand-deep" />
      </div>
      <div className="min-w-0 flex-1">
        <h2
          className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {title}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
}

function Pending({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </p>
  );
}

const itemCountText = (n: number) => `${n.toLocaleString()} ${n === 1 ? "item" : "items"}`;

/** What an empty "In your Dictionary" says, for whoever manages it. */
function emptyText({ choice, nameOf, hasAssistants }: Manager): string {
  if (choice === ME) {
    return hasAssistants
      ? "You haven't added any concepts yourself."
      : "Concepts are added by your Brainstorm Assistant, once you have one.";
  }
  if (choice === ALL) return "None of your Assistants has added any concepts yet.";
  return `${nameOf(choice)} hasn't added any concepts yet.`;
}

function ConceptRow({ entry, manager, href }: { entry: ManagedEntry; manager: Manager; href: string }) {
  const r = entry.resolved!;
  const fields = r.governing.fields;
  // The count reads the concept's items, so only once the row nears the screen.
  const rowRef = useRef<HTMLLIElement>(null);
  const near = useNearViewport(rowRef, "200px");
  const items = useConceptItems(entry, near);
  const wot = useWotItems(items.data ?? []);
  const counting = !items.data || wot.pending;
  return (
    <li ref={rowRef}>
      <Link
        href={href}
        className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-brand-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
        data-testid={`dictionary-row-${parseCoordinate(entry.communityCoordinate)?.d ?? "concept"}`}
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">{r.governing.plural}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400" data-testid="dictionary-row-count">
              {counting ? "…" : itemCountText(wot.trusted.length)}
            </span>
          </div>
          {r.governing.description && (
            <p className="text-sm text-slate-600 dark:text-slate-300">{r.governing.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <SourceChip entry={entry} nameOf={manager.nameOf} />
            <AgreementChip agreement={r.agreement} />
            {entry.support && entry.support.count > 0 && (
              <Chip tone="slate" data-testid="chip-dictionary-support">
                {entry.support.count} of {entry.support.of} Assistants
              </Chip>
            )}
          </div>
          {fields.length > 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {fields.length === 1 ? "Field" : "Fields"}: {fields.map((f) => f.name).join(", ")}
            </p>
          )}
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
      </Link>
    </li>
  );
}

const SOURCE_LABEL: Record<DefinitionSource, string> = {
  personal: "Your own copy",
  assistant: "Added by your Assistant",
  house: "Brainstorm's definition",
  community: "Not in your Dictionary yet",
};

/** Where the definition comes from — naming the Assistant whose copy it is, when the page knows. */
function SourceChip({ entry, nameOf }: { entry: ManagedEntry; nameOf: (pubkey: string) => string }) {
  const source = entry.resolved!.source;
  const inDictionary = source === "personal" || source === "assistant";
  return (
    <Chip tone={inDictionary ? "brand" : "slate"} data-testid="chip-dictionary-source">
      {source === "assistant" && entry.holder ? `Added by ${nameOf(entry.holder)}` : SOURCE_LABEL[source]}
    </Chip>
  );
}

/** Why a concept isn't in this Dictionary, for whoever manages it. */
function notAddedText({ choice, nameOf }: Manager): string {
  const until = "this is the community's definition.";
  if (choice === ME) return `You haven't added this concept to your Dictionary yourself. Until you do, ${until}`;
  if (choice === ALL)
    return `None of your Assistants has added this concept to your Dictionary yet. Until one does, ${until}`;
  return `${nameOf(choice)} hasn't added this concept to your Dictionary yet. Until it does, ${until}`;
}

function DictionaryEntryView({
  coordinate,
  entry,
  loading,
  manager,
  me,
  backHref,
}: {
  coordinate: string;
  entry: ManagedEntry | undefined;
  loading: boolean;
  manager: Manager;
  me: string | null;
  backHref: string;
}) {
  // This concept's items: the only list this page reads (services/dictionary loadConceptItems).
  const items = useConceptItems(entry);
  const back = (
    <Link
      href={backHref}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-link hover:underline"
      data-testid="link-dictionary-back"
    >
      <ArrowLeft className="h-4 w-4" /> Dictionary
    </Link>
  );
  if (loading)
    return (
      <div className="space-y-4">
        {back}
        <Pending label="Reading this concept…" />
      </div>
    );
  const r = entry?.resolved;
  if (!entry || !r)
    return (
      <div className="space-y-4">
        {back}
        <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="dictionary-entry-missing">
          This concept isn't in the Dictionary, or its definition couldn't be found on {dictionaryRelays().join(", ")}.
        </p>
      </div>
    );

  // The reader's own copy, whoever's Dictionary this is: what "Your own version" edits or withdraws.
  const ownCopy = entry.candidates
    ? me && entry.candidates.copies[me]
      ? definitionOf(entry.candidates.copies[me])
      : null
    : r.source === "personal"
      ? r.governing
      : null;

  return (
    <div className="space-y-4" data-testid="dictionary-entry">
      {back}
      <Card className="overflow-hidden">
        <CardHead title={r.governing.plural} subtitle={r.governing.description ?? ""} />
        <div className="space-y-6 p-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <SourceChip entry={entry} nameOf={manager.nameOf} />
            <AgreementChip agreement={r.agreement} />
          </div>
          {!entry.inDictionary && (
            <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="dictionary-entry-not-added">
              {manager.choice !== ME || manager.hasAssistants
                ? notAddedText(manager)
                : "Once you have a Brainstorm Assistant it can add this concept to your Dictionary. Until then, this is the community's definition."}
            </p>
          )}
          <FieldsSection fields={r.governing.fields} display={r.governing.display} />
          {r.governing.links.length > 0 && <LinksSection refs={r.governing.links} />}
          <ProvenanceSection resolved={r} coordinate={coordinate} />
          {r.community && <OwnVersionSection community={r.community} current={ownCopy} items={items.data ?? []} />}
          <ItemsSection items={items.data ?? []} loading={items.isPending} resolved={r} />
        </div>
      </Card>
    </div>
  );
}

/**
 * "Your own version" — offered on every entry; began as a demo, likely the seed of a list editor: publish a
 * personal copy of the concept, change it, withdraw it — and watch the
 * fields and item pages follow, since a personal copy outranks the
 * Assistant's and the community's.
 */
function OwnVersionSection({
  community,
  current,
  items,
}: {
  community: ConceptDefinition;
  current: ConceptDefinition | null;
  items: DictionaryItem[];
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Every read that resolves a concept: the Dictionary, item pages, admin's summary.
  const refresh = () =>
    Promise.all(
      ["dictionary", "item-concept", "admin/dictionary"].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );

  const withdraw = async () => {
    if (!current || busy) return;
    setBusy(true);
    setError(null);
    try {
      await withdrawOwnCopy(current);
      setWithdrawing(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3" data-testid="dictionary-own-version">
      <SectionHeader kicker="Your own version" />
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {current
          ? "You've published your own version, so it's the definition you see — here and on every item page."
          : "Publish your own version of this concept — different fields, required or optional — and items are shown by it instead."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setEditing(true)} data-testid="dictionary-version-edit">
          {current ? "Edit my version" : "Publish my own version"}
        </Button>
        {current && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setWithdrawing(true)}
            data-testid="dictionary-version-withdraw"
          >
            Withdraw my version
          </Button>
        )}
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <OwnVersionDialog
        open={editing}
        onOpenChange={setEditing}
        community={community}
        current={current}
        items={items}
        onPublished={() => void refresh()}
      />
      <Dialog open={withdrawing} onOpenChange={(next) => !busy && setWithdrawing(next)}>
        <DialogContent className="sm:max-w-md" data-testid="dictionary-version-withdraw-confirm">
          <DialogHeader>
            <DialogTitle>Withdraw your version?</DialogTitle>
            <DialogDescription>
              Your copy is republished as &ldquo;considered, affiliated with none&rdquo; in place of its pointer to the
              community concept, so it no longer counts as a version of {community.plural}. You&rsquo;ll see your
              Assistant&rsquo;s version, or the community&rsquo;s, again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setWithdrawing(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void withdraw()} disabled={busy} data-testid="dictionary-version-withdraw-go">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Withdraw"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

const REQUIREMENT_LABEL: Record<FieldDecl["requirement"], string> = {
  required: "Required",
  recommended: "Recommended",
  optional: "Optional",
};

/** The definition's links (provisional): each URL template it pins, and which field fills each placeholder. */
function LinksSection({ refs }: { refs: LinkRef[] }) {
  const templates = useLinkTemplates(refs);
  return (
    <section className="space-y-3" data-testid="dictionary-links">
      <SectionHeader kicker="Links" />
      <ul className="divide-y divide-border rounded-xl border border-border">
        {refs.map((ref, i) => {
          const tpl = templates.data?.get(ref.templateId);
          return (
            <li key={`${ref.templateId}-${i}`} className="space-y-1 px-4 py-2.5">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {tpl?.name ?? (templates.isPending ? "…" : "Template not found")}
                </span>
                {tpl && <code className="font-mono text-xs text-slate-500 dark:text-slate-400">{tpl.template}</code>}
              </div>
              <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                {ref.bindings.map(([p, f]) => `{${p}} ← ${f}`).join(" · ")}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function FieldsSection({ fields, display }: { fields: FieldDecl[]; display: DisplayHints | null }) {
  // The roles the definition gives its fields (provisional display hints), shown on the field.
  const rolesOf = (name: string) => [
    ...DISPLAY_ROLES.filter((role) => display?.[role] === name),
    ...(display?.facts.some((f) => f.field === name) ? [FACT_ROLE] : []),
  ];
  return (
    <section className="space-y-3" data-testid="dictionary-fields">
      <SectionHeader kicker="Fields" />
      {display?.listImage && (
        <p
          className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
          data-testid="dictionary-list-image"
        >
          <img
            src={avatarSrc(display.listImage, "sm")}
            alt=""
            className="h-6 w-6 rounded-md border border-border object-contain"
          />
          Every item wears this image.
        </p>
      )}
      {fields.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">This concept declares no fields.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {fields.map((f) => (
            <li key={f.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
              <code className="font-mono text-sm text-slate-900 dark:text-slate-100">{f.name}</code>
              {rolesOf(f.name).map((role) => (
                <Chip key={role} tone="accent" size="sm" data-testid={`dictionary-field-role-${role}`}>
                  {role}
                </Chip>
              ))}
              <Chip tone={f.requirement === "required" ? "brand" : "slate"} size="sm">
                {REQUIREMENT_LABEL[f.requirement]}
              </Chip>
              <Chip tone="slate" size="sm">
                {f.type}
              </Chip>
              {f.description && (
                <span className="w-full text-xs text-slate-500 dark:text-slate-400">{f.description}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Who({ pubkey }: { pubkey: string }) {
  const { profile } = useLiveProfile(pubkey);
  const name = profile?.display_name || profile?.name;
  return (
    <Link href={`/p/${pubkey}`} className="font-medium text-brand-link hover:underline">
      {name || `${pubkey.slice(0, 8)}…`}
    </Link>
  );
}

const SOURCE_SENTENCE: Record<DefinitionSource, string> = {
  personal: "You hold your own copy of this concept.",
  assistant: "Your Assistant holds a copy of this concept for you.",
  house: "You're seeing Brainstorm's copy of this concept.",
  community: "You're seeing the community's definition.",
};

const DIFFERENCE_LABEL = {
  names: "its name",
  description: "its description",
  fields: "its fields",
  display: "how its items read",
  links: "its links",
} as const;

function ProvenanceSection({ resolved: r, coordinate }: { resolved: ResolvedConcept; coordinate: string }) {
  const community = parseCoordinate(coordinate);
  return (
    <section className="space-y-3" data-testid="dictionary-provenance">
      <SectionHeader kicker="Where this definition comes from" />
      <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
        <p>{SOURCE_SENTENCE[r.source]}</p>
        {r.source !== "community" && (
          <p>
            It points at the community concept
            {community && (
              <>
                {" "}
                by <Who pubkey={community.pubkey} />
              </>
            )}
            {r.agreement === "agrees" && ", and agrees with it."}
            {r.agreement === "differs" &&
              `, and differs from it in ${r.differences.map((d) => DIFFERENCE_LABEL[d]).join(" and ")}.`}
            {r.agreement === "unknown" && ", which couldn't be found to compare."}
          </p>
        )}
        {r.source === "community" && community && (
          <p>
            Defined by <Who pubkey={community.pubkey} />.
          </p>
        )}
      </div>
      <dl className="grid gap-1 text-xs text-slate-500 dark:text-slate-400">
        {r.source !== "community" && (
          <div className="flex min-w-0 gap-2">
            <dt className="shrink-0">This copy</dt>
            <dd className="truncate font-mono" title={r.governing.coordinate}>
              {r.governing.coordinate}
            </dd>
          </div>
        )}
        <div className="flex min-w-0 gap-2">
          <dt className="shrink-0">Community</dt>
          <dd className="truncate font-mono" title={coordinate}>
            {coordinate}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function ItemsSection({
  items,
  loading = false,
  resolved,
}: {
  items: DictionaryItem[];
  /** The list itself is still being read. */
  loading?: boolean;
  /** The definition the rows are drawn from (DListItemRow). */
  resolved: ResolvedConcept;
}) {
  const noun = resolved.governing;
  const wot = useWotItems(items);
  // Null until the reader chooses: the filter may open the group on its own.
  const [showOutside, setShowOutside] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<ItemOrder>("newest");
  const plural = noun.plural.toLowerCase();
  const pending = loading || wot.pending;
  const filtering = query.trim().length > 0;
  // Found by the words a row shows (lib/dictionaryItems), then ordered — both groups alike.
  const trusted = useMemo(
    () => sortItems(filterItems(wot.trusted, noun, query), noun, order),
    [wot.trusted, noun, query, order],
  );
  const outside = useMemo(
    () => sortItems(filterItems(wot.outside, noun, query), noun, order),
    [wot.outside, noun, query, order],
  );
  const count = pending ? "…" : filtering ? `${trusted.length} of ${wot.trusted.length}` : wot.trusted.length;
  // A filter that only someone outside the web of trust answers shows them, rather than nothing.
  const outsideOpen = showOutside ?? (filtering && trusted.length === 0 && outside.length > 0);
  return (
    <section className="space-y-3" data-testid="dictionary-items">
      <SectionHeader kicker={`${noun.plural} · ${count}`} data-testid="dictionary-items-kicker" />
      {!loading && items.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Find a ${noun.singular.toLowerCase()}…`}
            aria-label={`Find a ${noun.singular.toLowerCase()}`}
            className="h-9 min-w-0 flex-1 sm:max-w-sm"
            data-testid="dictionary-items-filter"
          />
          <div className="flex items-center gap-0.5" role="group" aria-label="Sort">
            {ITEM_ORDERS.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setOrder(o.key)}
                aria-pressed={order === o.key}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  order === o.key
                    ? "bg-brand-primary text-white"
                    : "text-slate-500 hover:text-brand-primary dark:text-slate-400"
                }`}
                data-testid={`dictionary-items-sort-${o.key}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {loading ? (
        <Pending label={`Reading the ${plural}…`} />
      ) : wot.pending ? (
        <Pending label="Checking who's in your web of trust…" />
      ) : trusted.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="dictionary-items-none">
          {items.length === 0
            ? `No ${plural} yet.`
            : filtering
              ? `No ${plural} match from your web of trust.`
              : `None of these ${plural} are from your web of trust.`}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {trusted.map((item) => (
            <DListItemRow key={item.id} item={item} resolved={resolved} />
          ))}
        </ul>
      )}
      {!wot.pending && outside.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowOutside(!outsideOpen)}
            className="text-xs text-slate-500 hover:text-brand-link hover:underline dark:text-slate-400"
            aria-expanded={outsideOpen}
            data-testid="dictionary-items-outside"
          >
            {outsideOpen ? "Hide" : "Show"} {outside.length} more from accounts outside your web of trust
          </button>
          {outsideOpen && (
            <ul className="divide-y divide-border rounded-xl border border-dashed border-border opacity-70">
              {outside.map((item) => (
                <DListItemRow key={item.id} item={item} resolved={resolved} outside />
              ))}
            </ul>
          )}
        </div>
      )}
      {!wot.pending && wot.source === null && items.length > 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Couldn&rsquo;t reach a trust scorer, so nobody could be checked.
        </p>
      )}
    </section>
  );
}
