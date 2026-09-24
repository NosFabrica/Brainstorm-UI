import { useMemo } from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, FileText } from "lucide-react";
import { fetchAddressableEvents } from "@/services/nostr";
import { READER_KINDS } from "@/lib/shareId";
import type { MinimalEvent } from "@/lib/noteRefs";
import { OpenElsewhere } from "@/components/share/OpenElsewhere";
import { ArticleScreen, ArticleShell, decodeNaddr, type ArticleEvent } from "@/components/share/ArticleScreen";
import { EventScreen } from "@/components/share/EventScreen";

/**
 * `/a/<naddr>` — the latest version at an address. The address is only how
 * it was found: an article, wiki page or spec reads on the article layout,
 * any other kind (a listing, a track) on its own.
 */
export default function ArticlePage() {
  const [, params] = useRoute("/a/:id");
  const naddr = (params?.id || "").replace(/^nostr:/, "");
  const ptr = useMemo(() => decodeNaddr(naddr), [naddr]);

  // The address's latest version. `/a/` is only how it was found: the kind
  // decides how it reads — an article here, a listing or a track on the
  // event layout.
  const articleQuery = useQuery({
    queryKey: ["article", naddr],
    queryFn: async () => {
      if (!ptr) return null;
      const map = await fetchAddressableEvents([ptr], ptr.relays);
      return map.get(`${ptr.kind}:${ptr.pubkey}:${ptr.identifier}`) ?? null;
    },
    enabled: !!ptr,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const ev = articleQuery.data as ArticleEvent | null | undefined;
  if (ev && ptr && !READER_KINDS.has(ev.kind)) {
    return <EventScreen event={ev as unknown as MinimalEvent} ptr={{ id: ev.id, author: ev.pubkey, relays: ptr.relays }} />;
  }
  if (ev && ptr) return <ArticleScreen ev={ev} naddr={naddr} ptr={ptr} />;
  return (
    <ArticleShell title="Brainstorm">
      {!ptr ? (
        <div className="text-center py-20">
          <FileText className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto" />
          <p className="mt-3 text-slate-600 dark:text-slate-300 font-medium">That article link isn’t valid.</p>
          <Link href="/" className="mt-3 inline-block text-sm font-semibold text-brand-link hover:underline">Go to Brainstorm →</Link>
        </div>
      ) : articleQuery.isLoading ? (
        <div className="flex items-center justify-center py-24 text-slate-400 dark:text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="text-center py-20">
          <FileText className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto" />
          <p className="mt-3 text-slate-600 dark:text-slate-300 font-medium">We couldn’t find this article on the relays.</p>
          {/* The naddr says which kind it is, so only clients that render it are offered. */}
          <OpenElsewhere entity={{ kind: "article", eventKind: ptr.kind, bech32: naddr, uri: `nostr:${naddr}` }} className="mt-5" />
        </div>
      )}
    </ArticleShell>
  );
}
