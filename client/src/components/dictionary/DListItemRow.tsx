/**
 * A list item as a row of its list — the items on a Dictionary entry. The
 * fourth way an item is drawn, from the same view as its page, card and
 * popup row (useItemView), and the popup row's own tile and text (ItemLine):
 * the title, and the summary on the grey line — every row here is the same
 * kind, so the popup's "GitHub Account ·" would be noise.
 *
 * What a list adds, being where items are compared: a required field the
 * item lacks, said on the row; and its first link as the site's favicon at
 * the end, outside the row's own link — never an anchor inside an anchor.
 *
 * Handed the resolved definition by the entry that draws it, so a list of
 * hundreds of items is one definition, not hundreds of lookups.
 */
import { ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { Chip } from "@/components/ui/chip";
import { Favicon } from "@/components/share/LinkPreview";
import { isReady, useResolvedItemView } from "@/hooks/useItemView";
import { fieldCell } from "@/lib/dlistFields";
import { eventPath } from "@/lib/shareId";
import { dictionaryRelays } from "@/config/dictionary";
import type { ResolvedConcept } from "@/lib/conceptResolution";
import { ItemLine } from "./ItemLine";

type ItemEvent = { id: string; pubkey: string; kind: number; tags: string[][] };

export function DListItemRow({
  item,
  resolved,
  outside = false,
}: {
  item: ItemEvent;
  resolved: ResolvedConcept;
  /** From an author outside the reader's web of trust: shown on request, dimmed by its list. */
  outside?: boolean;
}) {
  const view = useResolvedItemView(item, resolved);
  const testId = outside ? "dictionary-item-outside" : "dictionary-item";
  if (!isReady(view)) return null;

  const { shown, links } = view;
  const link = links[0];
  const missing = resolved.governing.fields.filter((f) => fieldCell(item, f).missing).map((f) => f.name);
  return (
    <li className="flex items-center gap-2 pr-3 hover:bg-slate-50 dark:hover:bg-slate-900" data-testid={testId}>
      <Link href={eventPath(item, dictionaryRelays())} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3">
        <ItemLine shown={shown} singular={resolved.governing.singular} line={shown.summary} testId={testId} />
        {missing.length > 0 && (
          <Chip tone="warning" size="sm" data-testid="dictionary-item-missing">
            missing {missing.join(", ")}
          </Chip>
        )}
      </Link>
      {link && (
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          title={`${link.label} · ${link.host}`}
          aria-label={link.label}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
          data-testid={`${testId}-link`}
        >
          <Favicon host={link.host} className="h-3.5 w-3.5 rounded-sm" />
        </a>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true" />
    </li>
  );
}
