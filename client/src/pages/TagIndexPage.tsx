import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Search, Tag as TagIcon, Users } from "lucide-react";
import { PublicPageHeader } from "@/components/PublicPageHeader";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { Chip } from "@/components/ui/chip";
import { useTagIndex } from "@/hooks/useTags";
import { npubFromPubkey } from "@/lib/shareId";
import type { TagSummary } from "@/services/tags";

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
  const [sort, setSort] = useState<Sort>("used");
  const [filter, setFilter] = useState("");

  const tags = useMemo(() => {
    const all = data ?? [];
    const q = filter.trim().toLowerCase();
    const matched = q ? all.filter((t) => t.name.toLowerCase().includes(q)) : all;
    // The service already returns most-used order, so only A–Z needs re-sorting.
    return sort === "az" ? [...matched].sort((a, b) => a.name.localeCompare(b.name)) : matched;
  }, [data, sort, filter]);

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
    <div className="min-h-[100dvh] bg-[#F8FAFC] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans flex flex-col">
      <PublicPageHeader maxWidthClass="max-w-2xl" />
      <main className="w-full max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex-1" data-testid="tag-index-page">
        <PageHeader
          kicker="Tags"
          title="Browse tags"
          subtitle="What the network says people are known for."
          testId="tag-index-header"
        />

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter tags"
              className="w-full rounded-full border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-brand-primary dark:border-slate-700 dark:bg-slate-900"
              data-testid="tag-index-filter"
            />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {tab("used", "Most used")}
            {tab("az", "A–Z")}
          </div>
        </div>

        <div className="mt-4 mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          <TagIcon className="h-3.5 w-3.5" />
          {isLoading ? "Loading" : `${tags.length} ${tags.length === 1 ? "tag" : "tags"}`}
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
                title={filter ? "No tags match that" : "No tags yet"}
                description={
                  filter
                    ? "Try a shorter word."
                    : "Tags show up here once someone adds one to a profile."
                }
              />
            </div>
          ) : (
            tags.map((tag) => <TagIndexRow key={tag.key} tag={tag} />)
          )}
        </div>
      </main>
    </div>
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
