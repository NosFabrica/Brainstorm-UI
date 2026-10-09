/**
 * A list item among the rest of its list, under its page: who else listed
 * the same thing, and a few of the list's other things (lib/itemNeighbours).
 *
 * Only listers in the reader's web of trust count, the rule a Dictionary
 * entry's own rows follow (useWotItems): an account nobody the reader trusts
 * stands behind adds no weight here and is not offered as "more". The whole
 * list is the Dictionary's, so the way in to it is an admin's for now.
 *
 * Nothing renders for an item alone in its list, or while the list is read.
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SectionHeader } from "@/components/ui/section-header";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useAuthors } from "@/components/share/things/shared";
import { dictionaryRelays } from "@/config/dictionary";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useConceptItems } from "@/hooks/useConceptItems";
import { useResolvedItemView, isReady } from "@/hooks/useItemView";
import { useWotItems } from "@/hooks/useWotItems";
import { neighboursOf } from "@/lib/itemNeighbours";
import { getDisplayLabel } from "@/lib/profileSearch";
import { eventPath } from "@/lib/shareId";
import { dictionaryConceptOf, type DictionaryItem } from "@/services/dictionary";
import type { ResolvedConcept } from "@/lib/conceptResolution";
import { ItemLine } from "./ItemLine";

type ItemEvent = { id: string; kind: number; pubkey: string; tags: string[][] };

const MAX_MORE = 3;
const MAX_FACES = 3;
const NO_ITEMS: DictionaryItem[] = [];

export function DListItemNeighbours({ event, resolved }: { event: ItemEvent; resolved: ResolvedConcept }) {
  const isAdmin = useActiveAccountDisplay()?.isAdmin === true;
  const coordinate = dictionaryConceptOf(event);
  const entry = useMemo(
    () =>
      coordinate ? { communityCoordinate: coordinate, resolved, inDictionary: false, items: NO_ITEMS } : undefined,
    [coordinate, resolved],
  );
  const items = useConceptItems(entry);
  const wot = useWotItems(items.data ?? NO_ITEMS);
  const { alsoListedBy, more, total } = useMemo(
    () => neighboursOf(event, wot.trusted, resolved.governing, MAX_MORE),
    [event, wot.trusted, resolved.governing],
  );
  const authors = useAuthors(alsoListedBy.slice(0, MAX_FACES));

  if (alsoListedBy.length === 0 && more.length === 0) return null;
  const faces = alsoListedBy.slice(0, MAX_FACES).map((pk) => authors.get(pk)!);
  const rest = alsoListedBy.length - faces.length;
  return (
    <div
      className="space-y-5 border-t border-slate-100 pt-4 dark:border-slate-800/60"
      data-testid="dlist-item-neighbours"
    >
      {faces.length > 0 && (
        <p
          className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-slate-600 dark:text-slate-300"
          data-testid="dlist-item-also-listed"
        >
          <span className="flex -space-x-1.5">
            {faces.map((f) => (
              <Avatar key={f.pubkey} className="h-6 w-6 border-2 border-white dark:border-slate-900">
                {f.picture ? <AvatarImage src={f.picture} alt="" className="object-cover" /> : null}
                <AvatarFallback className="overflow-hidden">
                  <DefaultAvatarImg />
                </AvatarFallback>
              </Avatar>
            ))}
          </span>
          <span>
            Also listed by{" "}
            {faces.map((f, i) => (
              <span key={f.pubkey}>
                {i > 0 && (i === faces.length - 1 && rest === 0 ? " and " : ", ")}
                <Link href={`/p/${f.npub}`} className="font-medium text-slate-900 hover:underline dark:text-slate-100">
                  {getDisplayLabel(f)}
                </Link>
              </span>
            ))}
            {rest > 0 && ` and ${rest} more`}
          </span>
        </p>
      )}
      {more.length > 0 && (
        <section data-testid="dlist-item-more-from-list">
          <div className="mb-2 flex items-baseline gap-2">
            <SectionHeader kicker={`More ${resolved.governing.plural}`} className="flex-1" />
            {isAdmin && coordinate && (
              <Link
                href={`/settings?tab=dictionary&concept=${encodeURIComponent(coordinate)}`}
                className="shrink-0 text-xs font-medium text-slate-500 hover:text-brand-link hover:underline dark:text-slate-400"
                data-testid="dlist-item-see-all"
              >
                See all {total}
              </Link>
            )}
          </div>
          <ul className="grid gap-2 sm:grid-cols-3">
            {more.map((item) => (
              <MoreItem key={item.id} item={item} resolved={resolved} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function MoreItem({ item, resolved }: { item: DictionaryItem; resolved: ResolvedConcept }) {
  const view = useResolvedItemView(item, resolved);
  if (!isReady(view)) return null;
  return (
    <li className="min-w-0">
      <Link
        href={eventPath(item, dictionaryRelays())}
        className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:border-slate-700 dark:hover:bg-slate-900"
      >
        <ItemLine
          shown={view.shown}
          singular={resolved.governing.singular}
          line={view.shown.summary}
          testId="dlist-item-more"
        />
      </Link>
    </li>
  );
}
