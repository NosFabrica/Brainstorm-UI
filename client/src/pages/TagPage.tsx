import { useEffect, useMemo } from "react";
import { useRoute, Redirect, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Tag as TagIcon, Users } from "lucide-react";
import { PublicPageHeader } from "@/components/PublicPageHeader";
import { PageHeader } from "@/components/PageHeader";
import { PersonListRow, PersonListSkeleton } from "@/components/PersonListRow";
import { EmptyState } from "@/components/ui/empty-state";
import { useScorePov } from "@/components/score/TrustScorePov";
import { fetchProfileMap } from "@/services/nostr";
import { useTagDetail } from "@/hooks/useTags";
import { decodeShareId, npubFromPubkey } from "@/lib/shareId";

/**
 * `/tags/:author/:slug` — everyone the network says carries one tag.
 *
 * This is the view that makes tagging legible as *lists*: a tag isn't a label
 * sitting on one profile, it's the set of people carrying it, and this is that
 * set. Every chip on a profile links here.
 *
 * Public and anon-viewable. The read is relays-only (see services/tags.ts), so
 * a logged-out visitor sees exactly what a signed-in one does — the counts come
 * from the configured trust perspective, not from who's looking.
 *
 * `:author` accepts hex or npub, since the tag's author is a pubkey like any
 * other and people will paste whichever form they have.
 */

/** Set/reset the document title + OG meta for shareable previews. */
function useTagMeta(name: string, count: number) {
  useEffect(() => {
    const title = `${name} · Brainstorm`;
    const desc =
      count > 0
        ? `${count} ${count === 1 ? "person" : "people"} the network says are ${name}, on Brainstorm.`
        : `People the network says are ${name}, on Brainstorm.`;
    const prevTitle = document.title;
    document.title = title;
    const set = (sel: string, attr: string, val: string) => {
      const el = document.querySelector(sel);
      const prev = el?.getAttribute(attr) ?? null;
      el?.setAttribute(attr, val);
      return () => { if (prev != null) el?.setAttribute(attr, prev); };
    };
    const undo = [
      set('meta[name="description"]', "content", desc),
      set('meta[property="og:title"]', "content", title),
      set('meta[property="og:description"]', "content", desc),
    ];
    return () => { document.title = prevTitle; undo.forEach((u) => u()); };
  }, [name, count]);
}

export default function TagPage() {
  const [, params] = useRoute("/tags/:author/:slug");
  const rawAuthor = params?.author;
  const slug = params?.slug;
  const { pov: scorePov } = useScorePov();

  const authorPubkey = useMemo(() => {
    if (!rawAuthor) return undefined;
    try { return decodeShareId(rawAuthor)?.pubkey; } catch { return undefined; }
  }, [rawAuthor]);

  const detailQuery = useTagDetail(authorPubkey, slug);
  const carriers = detailQuery.data?.carriers ?? [];
  const tagName = detailQuery.data?.tag.name || slug || "Tag";

  const pubkeys = useMemo(() => carriers.map((c) => c.pubkey), [carriers]);
  const profilesQuery = useQuery({
    queryKey: ["tag-profiles", pubkeys.join(",")],
    queryFn: () => fetchProfileMap(pubkeys),
    enabled: pubkeys.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const profileMap = profilesQuery.data;

  useTagMeta(tagName, carriers.length);

  // Params read null on the first render after an in-app navigation, so bail
  // quietly rather than firing a redirect that would corrupt the back stack.
  // Only redirect once we know the author genuinely won't decode. (wouter's
  // <Redirect> pushes by default — `replace` is load-bearing here.)
  if (!rawAuthor || !slug) return null;
  if (!authorPubkey) return <Redirect to="/" replace />;

  const loading = detailQuery.isLoading;
  let authorNpub = "";
  try { authorNpub = npubFromPubkey(authorPubkey); } catch { /* leave unlinked */ }

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans flex flex-col">
      <PublicPageHeader maxWidthClass="max-w-2xl" />
      <main className="w-full max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex-1" data-testid="tag-page">
        <button
          type="button"
          onClick={() => history.back()}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-primary dark:text-slate-400 transition-colors"
          data-testid="tag-back"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <PageHeader
          kicker="Tag"
          title={tagName}
          subtitle={
            detailQuery.data?.tag.description ||
            "People the network says this describes."
          }
          testId="tag-header"
        />

        {/* Who defined this tag. Tags aren't owned by the app — someone minted
            this one, and saying who is part of the point. */}
        {authorNpub && (
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500" data-testid="tag-author">
            Tag created by{" "}
            <Link href={`/p/${authorNpub}`} className="font-medium text-brand-link hover:underline">
              {authorNpub.slice(0, 12)}…
            </Link>
          </p>
        )}

        <div className="mt-5 mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          <Users className="h-3.5 w-3.5" />
          {loading ? "Loading" : `${carriers.length} ${carriers.length === 1 ? "person" : "people"}`}
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm divide-y divide-slate-100 dark:divide-slate-800/60 overflow-hidden">
          {loading ? (
            <PersonListSkeleton testId="tag-skeleton" />
          ) : carriers.length === 0 ? (
            <div className="px-4 py-8">
              <EmptyState
                icon={TagIcon}
                compact
                title="Nobody has this tag yet"
                description="When someone adds it, they'll show up here."
              />
            </div>
          ) : (
            carriers.map((c) => {
              const p = profileMap?.get(c.pubkey);
              return (
                <PersonListRow
                  key={c.pubkey}
                  pubkey={c.pubkey}
                  displayName={p?.display_name || p?.name}
                  picture={p?.picture}
                  nip05={p?.nip05}
                  pov={scorePov}
                  testId={`tag-row-${c.pubkey.slice(0, 8)}`}
                  meta={
                    // Not `tag-row-count`: that would match a `tag-row-*`
                    // prefix selector and double-count every row.
                    <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500" data-testid="tag-vouch-count">
                      {c.applications === 1 ? "1 person added this" : `${c.applications} people added this`}
                      {c.disputes > 0 && ` · ${c.disputes} disagreed`}
                    </p>
                  }
                />
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
