import { useQuery } from "@tanstack/react-query";
import { Loader2, FileText } from "lucide-react";
import { fetchAddressableEvents } from "@/services/nostr";
import { newerEvent, useHeldReplaceable } from "@/hooks/useHeldEvents";
import { READER_KINDS } from "@/lib/shareId";
import type { MinimalEvent } from "@/lib/noteRefs";
import { OpenElsewhere } from "@/components/share/OpenElsewhere";
import { ArticleScreen, ArticleShell, type AddressPointer, type ArticleEvent } from "@/components/share/ArticleScreen";
import { EventScreen } from "@/components/share/EventScreen";
import { isBlankEvent } from "@/lib/blankEvent";

/**
 * An `naddr`: whatever its author last published at the address. The
 * address is only how it was found — an article, wiki page or spec reads on
 * the article layout, any other kind (a listing, a track) on its own.
 *
 * A copy already in the store (a search result, a card on another page)
 * shows at once; the relays are still asked, and any newer version that
 * arrives replaces it where it stands. The spinner is only for an address
 * nothing on the device has seen.
 */
export function AddressScreen({ naddr, ptr }: { naddr: string; ptr: AddressPointer }) {
  const articleQuery = useQuery({
    queryKey: ["article", naddr],
    queryFn: async () => {
      // The naddr's own relay hints ride on the pointer, beside the default
      // relays and the author's outbox — added to them, never instead of them.
      const map = await fetchAddressableEvents([ptr]);
      return map.get(`${ptr.kind}:${ptr.pubkey}:${ptr.identifier}`) ?? null;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const held = useHeldReplaceable(ptr.kind, ptr.pubkey, ptr.identifier);
  const ev = newerEvent(articleQuery.data ?? undefined, held) as ArticleEvent | undefined;
  // Deleted by overwriting: the address resolves to a husk. The event layout
  // says what happened rather than the reader showing an article called "[Deleted]".
  if (ev && (isBlankEvent(ev) || !READER_KINDS.has(ev.kind))) {
    return <EventScreen event={ev as unknown as MinimalEvent} ptr={{ id: ev.id, author: ev.pubkey, relays: ptr.relays }} />;
  }
  if (ev) return <ArticleScreen ev={ev} naddr={naddr} ptr={ptr} />;
  return (
    <ArticleShell title="Brainstorm">
      {articleQuery.isLoading ? (
        <div className="flex items-center justify-center py-24 text-slate-400 dark:text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="text-center py-20">
          <FileText className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto" />
          <p className="mt-3 text-slate-600 dark:text-slate-300 font-medium">
            We couldn’t find this {READER_KINDS.has(ptr.kind) ? "article" : "post"} on the relays.
          </p>
          {/* The naddr says which kind it is, so only clients that render it are offered. */}
          <OpenElsewhere entity={{ kind: "article", eventKind: ptr.kind, bech32: naddr, uri: `nostr:${naddr}` }} className="mt-5" />
        </div>
      )}
    </ArticleShell>
  );
}

