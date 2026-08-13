import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Search, Tag as TagIcon, User as UserIcon, Users } from "lucide-react";
import { TagsPageShell } from "@/components/tags/TagsPageShell";
import { TagsCrossLink } from "@/components/tags/TagsCrossLink";
import { EmptyState } from "@/components/ui/empty-state";
import { Chip } from "@/components/ui/chip";
import { UnverifiedTagChip } from "@/components/search/UnverifiedTagChip";
import { useTagIndex } from "@/hooks/useTags";

import { npubFromPubkey } from "@/lib/shareId";
import type { TagSummary } from "@/services/tags";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";

/**
 * `/tags` — every tag people actually use.
 *
 * Without this, a tag is only reachable by stumbling on a profile that carries
 * it, which makes the whole system invisible to anyone who hasn't been shown it.
 *
 * "Most used" vs "A–Z" rather than the usual Top/New: a tag has no meaningful
 * creation date to sort by — what matters is whether anyone stands behind it.
 */

type Sort = "used" | "az";

export default function TagIndexPage() {
  const { data, isLoading } = useTagIndex();
  const signedIn = !!useActiveAccountDisplay()?.pubkey;
  const [sort, setSort] = useState<Sort>("used");
  const [filter, setFilter] = useState("");

  const q = filter.trim().toLowerCase();

  /**
   * Gate the list, never the query.
   *
   * With nothing typed this is an unrequested list, and the ~840 tags whose
   * creator has no standing are overwhelmingly harness output — they'd bury
   * the real ones. The moment somebody types a name they are asking for a
   * specific thing, and hiding it is how `lfo` (54 people) returned "No tags
   * match that" for the exact string "LFO".
   */
  const tags = useMemo(() => {
    const all = data ?? [];
    const matched = q
      ? all.filter((t) => t.name.toLowerCase().includes(q))
      : all.filter((t) => !t.unverified);
    const sorted =
      sort === "az" ? [...matched].sort((a, b) => a.name.localeCompare(b.name)) : matched;
    // Vouched-for creators lead either way; the stable sort keeps the chosen
    // order beneath that.
    return q
      ? [...sorted].sort((a, b) => Number(a.unverified) - Number(b.unverified))
      : sorted;
  }, [data, sort, q]);

  const hidden = useMemo(() => (data ?? []).filter((t) => t.unverified).length, [data]);

  const tab = (key: Sort, label: string) => (
    <button
      type="button"
      onClick={() => setSort(key)}
      aria-pressed={sort === key}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
        sort === key
          ? "bg-brand-primary text-white"
          : "text-slate-500 hover:text-brand-primary dark:text-slate-400"
      }`}
      data-testid={`tag-index-sort-${key}`}
    >
      {label}
    </button>
  );

  return (
    <TagsPageShell
      view="browse"
      title="Tags"
      subtitle="What the network says people are known for."
    >
      <div data-testid="tag-index-page">
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search every tag by name"
              className="w-full rounded-full border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-brand-primary dark:border-slate-700 dark:bg-slate-900"
              data-testid="tag-index-filter"
            />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {tab("used", "Most used")}
            {tab("az", "A–Z")}
          </div>
        </div>

        <div className="mt-4 mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          <span className="flex items-center gap-1.5">
            <TagIcon className="h-3.5 w-3.5" />
            {isLoading ? "Loading" : `${tags.length} ${tags.length === 1 ? "tag" : "tags"}`}
          </span>
          {/* Say that the list is curated, rather than letting people conclude
              a tag doesn't exist because it isn't here. */}
          {!isLoading && !q && hidden > 0 && (
            <span className="font-normal normal-case tracking-normal" data-testid="tag-index-hidden-note">
              · search to include {hidden} more from creators we know nothing about
            </span>
          )}
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm divide-y divide-slate-100 dark:divide-slate-800/60 overflow-hidden">
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse" data-testid="tag-index-skeleton">
                <div className="h-4 w-28 rounded bg-slate-100 dark:bg-slate-800" />
                <div className="ml-auto h-3 w-16 rounded bg-slate-100 dark:bg-slate-800" />
              </div>
            ))
          ) : tags.length === 0 ? (
            <div className="px-4 py-8">
              <EmptyState
                icon={TagIcon}
                compact
                title={q ? "No tags match that" : "No tags yet"}
                description={
                  q
                    ? "Try a shorter word. Searching looks through every tag, not just the ones listed here."
                    : "Tags show up here once someone adds one to a profile."
                }
              />
            </div>
          ) : (
            tags.map((tag) => <TagIndexRow key={tag.key} tag={tag} />)
          )}
        </div>

        {/* The other half of Tags. Only for signed-in visitors — a logged-out
            one would just be walked into a sign-in wall, and the way in for
            them is a tag page they can actually read. */}
        {signedIn && (
          <div className="mt-8 border-t border-slate-100 pt-6 dark:border-slate-800/60">
            <TagsCrossLink
              href="/tags/mine"
              icon={UserIcon}
              title="Your tags"
              description="What people say about you, and what you've said about them"
              testId="tag-index-mine"
            />
          </div>
        )}
      </div>
    </TagsPageShell>
  );
}

function TagIndexRow({ tag }: { tag: TagSummary }) {
  let authorNpub = "";
  try { authorNpub = npubFromPubkey(tag.authorPubkey); } catch { /* unlinkable */ }
  if (!authorNpub) return null;

  return (
    <Link
      href={`/tags/${authorNpub}/${tag.slug}`}
      className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
      data-testid={`tag-index-row-${tag.slug}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{tag.name}</span>
          {tag.sharesName > 1 && (
            <Chip
              tone="slate"
              size="sm"
              title={`${tag.sharesName} people made a tag with this name. Each one is listed separately.`}
            >
              1 of {tag.sharesName}
            </Chip>
          )}
          {tag.unverified && <UnverifiedTagChip />}
        </div>
        {tag.description && (
          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{tag.description}</p>
        )}
      </div>
      <span className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-slate-400 dark:text-slate-500">
        <span className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5" />
          {tag.people}
        </span>
        {/* Diversity, not just size. A list of 24 assembled by one account is a
            different object from 24 people agreeing, and the browse view is
            where you'd choose which to open. */}
        {tag.vouches > 0 && (
          <span className="text-[10px]" data-testid="tag-index-vouchers">
            {tag.vouches} {tag.vouches === 1 ? "account" : "accounts"}
          </span>
        )}
      </span>
    </Link>
  );
}
