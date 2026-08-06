import { useEffect, useMemo, useState } from "react";
import { useRoute, Redirect, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2, Plus, Tag as TagIcon, Users } from "lucide-react";
import { PublicPageHeader } from "@/components/PublicPageHeader";
import { PageHeader } from "@/components/PageHeader";
import { PersonListRow, PersonListSkeleton } from "@/components/PersonListRow";
import { EmptyState } from "@/components/ui/empty-state";
import { useScorePov } from "@/components/score/TrustScorePov";
import { fetchProfileMap, hasLocalSecretKey } from "@/services/nostr";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useTagDetail, useTagVote } from "@/hooks/useTags";
import { TagVoteButton } from "@/components/share/TagVoteButton";
import { TagComments } from "@/components/share/TagComments";


import { CarrierMeta } from "@/components/share/CarrierMeta";
import { LinkedText } from "@/components/LinkedText";
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

/** Below this many people a filter bar is furniture; badges carry it instead. */
const FILTER_THRESHOLD = 10;

type CarrierSort = "vouched" | "recent";

export default function TagPage() {
  const [, params] = useRoute("/tags/:author/:slug");
  const [sort, setSort] = useState<CarrierSort>("vouched");
  const [hideSelfDeclared, setHideSelfDeclared] = useState(false);
  const [hideContested, setHideContested] = useState(false);
  const rawAuthor = params?.author;
  const slug = params?.slug;
  const { pov: scorePov } = useScorePov();

  const authorPubkey = useMemo(() => {
    if (!rawAuthor) return undefined;
    try { return decodeShareId(rawAuthor)?.pubkey; } catch { return undefined; }
  }, [rawAuthor]);

  const detailQuery = useTagDetail(authorPubkey, slug);
  const vote = useTagVote(authorPubkey, slug);
  const carriers = detailQuery.data?.carriers ?? [];
  const tagName = detailQuery.data?.tag.name || slug || "Tag";

  // Voting needs a SIGNER, not just a session — same rule as the profile
  // picker, for the same reason: a token can't sign an event.
  const [currentUser] = useCurrentUser();
  const viewerPubkey = currentUser?.pubkey;
  const canVote =
    !!viewerPubkey &&
    (hasLocalSecretKey() || (typeof window !== "undefined" && !!(window as unknown as { nostr?: unknown }).nostr));

  // The tag's author rides along with the carriers so their name resolves in
  // the same round-trip — the alternative was a second query for one pubkey.
  const pubkeys = useMemo(() => {
    // Carriers, the tag's author, and everyone who vouched — one round-trip
    // resolves every name and face the page shows.
    const list = new Set(carriers.map((c) => c.pubkey));
    for (const c of carriers) for (const a of c.asserters) list.add(a);
    if (authorPubkey) list.add(authorPubkey);
    return Array.from(list);
  }, [carriers, authorPubkey]);
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
  const distinctVouchers = new Set(carriers.flatMap((c) => c.asserters)).size;
  const iAmListed = !!viewerPubkey && carriers.some((c) => c.pubkey === viewerPubkey && c.myStance !== "dispute");

  /**
   * Filters appear only once a list is big enough to need them. 27 of the 39
   * tags on the hub have fewer than four people — a filter bar over three rows
   * is furniture, and the row badges already do the job at that size.
   */
  const showFilters = carriers.length >= FILTER_THRESHOLD;
  const visible = useMemo(() => {
    let list = carriers;
    if (hideSelfDeclared) list = list.filter((c) => c.applications > 0);
    if (hideContested) list = list.filter((c) => c.disputes === 0 && !c.subjectDisagreed);
    if (sort === "recent") list = [...list].sort((a, b) => b.addedAt - a.addedAt);
    return list;
  }, [carriers, hideSelfDeclared, hideContested, sort]);
  const authorProfile = profileMap?.get(authorPubkey);
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
            // Descriptions are user-authored and several carry links — the AOS
            // tag points at its own event site. Plain text made those
            // un-followable. No link PREVIEW though: fetching a page's OG tags
            // needs a server, and this app has none — the browser can't read
            // cross-origin HTML. A preview card would mean a backend, so it's
            // a deliberate omission rather than an oversight.
            detailQuery.data?.tag.description ? (
              <LinkedText text={detailQuery.data.tag.description} />
            ) : (
              "People the network says this describes."
            )
          }
          testId="tag-header"
        />

        {/* Who defined this tag. Tags aren't owned by the app — someone minted
            this one, and saying who is part of the point. Show their NAME: a
            truncated npub tells a normal reader nothing except that this is
            complicated. Falls back to the npub only when there's no profile. */}
        {authorNpub && (
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500" data-testid="tag-author">
            Tag created by{" "}
            <Link href={`/p/${authorNpub}`} className="font-medium text-brand-link hover:underline">
              {authorProfile?.display_name || authorProfile?.name || `${authorNpub.slice(0, 12)}…`}
            </Link>
          </p>
        )}

        {/* Adoption lives or dies here. People arrive at this page from search,
            a chip or a shared link — sending them off to a profile to act was
            the whole distance between "I see this list" and "I'm on it".
            Web-of-trust can only rank assertions people actually make. */}
        {canVote && !loading && (
          <div className="mt-4" data-testid="tag-self-add">
            {iAmListed ? (
              <p className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                <Check className="h-3.5 w-3.5" />
                You're on this list
              </p>
            ) : (
              <button
                type="button"
                onClick={() => vote.mutate({ targetPubkey: viewerPubkey!, polarity: 1 })}
                disabled={vote.isPending}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:opacity-50"
                data-testid="tag-add-me"
              >
                {vote.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add me to this tag
              </button>
            )}
          </div>
        )}

        <div className="mt-5 mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {loading ? "Loading" : `${carriers.length} ${carriers.length === 1 ? "person" : "people"}`}
          </span>
          {/* How many DISTINCT accounts built this list. Without it, a list one
              account assembled reads exactly like a list two dozen people
              agreed on — and on this hub that's the common case, not the edge
              one. Cheapest brigading tell available while trust is inert. */}
          {!loading && distinctVouchers > 0 && (
            <span className="font-medium normal-case tracking-normal" data-testid="tag-voucher-count">
              · added by {distinctVouchers}{" "}
              {distinctVouchers === 1 ? "account" : "accounts"}
            </span>
          )}
        </div>

        {!loading && carriers.length > 1 && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5" data-testid="tag-controls">
            <SortChip active={sort === "vouched"} onClick={() => setSort("vouched")} testId="tag-sort-vouched">
              Most vouched
            </SortChip>
            <SortChip active={sort === "recent"} onClick={() => setSort("recent")} testId="tag-sort-recent">
              Recently added
            </SortChip>
            {showFilters && (
              <>
                <span className="mx-1 h-3 w-px bg-slate-200 dark:bg-slate-700" />
                <SortChip
                  active={hideSelfDeclared}
                  onClick={() => setHideSelfDeclared((v) => !v)}
                  testId="tag-filter-self"
                >
                  Vouched only
                </SortChip>
                <SortChip
                  active={hideContested}
                  onClick={() => setHideContested((v) => !v)}
                  testId="tag-filter-contested"
                >
                  Hide contested
                </SortChip>
              </>
            )}
          </div>
        )}

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm divide-y divide-slate-100 dark:divide-slate-800/60 overflow-hidden">
          {loading ? (
            <PersonListSkeleton testId="tag-skeleton" />
          ) : visible.length === 0 && carriers.length > 0 ? (
            <div className="px-4 py-8">
              <EmptyState
                icon={TagIcon}
                compact
                title="Nothing matches those filters"
                description="Turn one off to see the rest of the list."
              />
            </div>
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
            visible.map((c) => {
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
                  actions={
                    canVote ? (
                      <TagVoteButton
                        stance={c.myStance}
                        pending={vote.isPending && vote.variables?.targetPubkey === c.pubkey}
                        onVote={(polarity) => vote.mutate({ targetPubkey: c.pubkey, polarity })}
                        testId={`tag-vote-${c.pubkey.slice(0, 8)}`}
                      />
                    ) : undefined
                  }
                  meta={
                    // Not `tag-row-count`: that would match a `tag-row-*`
                    // prefix selector and double-count every row.
                    <CarrierMeta
                      carrier={c}
                      profileMap={profileMap}
                      isViewer={c.pubkey === viewerPubkey}
                    />
                  }
                />
              );
            })
          )}
        </div>

        <TagComments authorPubkey={authorPubkey} slug={slug} canPost={canVote} />
      </main>
    </div>
  );
}

/** A sort or filter toggle. Same pill for both — they're the same gesture. */
function SortChip({
  active,
  onClick,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
        active
          ? "bg-brand-primary text-white"
          : "text-slate-500 hover:text-brand-primary dark:text-slate-400"
      }`}
      data-testid={testId}
    >
      {children}
    </button>
  );
}
