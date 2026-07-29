import { EmbeddedArticleCard } from "@/components/share/EmbeddedArticleCard";
import type { MinimalEvent } from "@/lib/noteRefs";
import type { NetworkArticle } from "@/hooks/useNetworkArticles";

type ProfileLite = { name?: string; display_name?: string; picture?: string; nip05?: string };

/**
 * One article in a "Reading from your network" grid, with the trust attribution
 * underneath. Shared by the dashboard strip and the full /reading page so the two
 * can't drift apart — the attribution wording in particular is a claim about the
 * data and should only be worded once.
 *
 * h-full + a flex-1 media slot so every card in a row shares one height whether
 * or not it has a summary; the attribution is pinned to the bottom so those
 * baselines line up too.
 */
export function NetworkArticleCard({
  article,
  profile,
}: {
  article: NetworkArticle;
  profile?: ProfileLite;
}) {
  const { event, author } = article;
  return (
    <div className="flex h-full flex-col gap-1" data-testid="network-article">
      <div className="flex-1 [&>*]:!mt-0 [&>*]:h-full">
        <EmbeddedArticleCard event={event as MinimalEvent} author={profile} />
      </div>
      {/* Why you're seeing this — the one line no other client can print. The
          count is literally what it says: how many accounts you FOLLOW also follow
          this author (co-follows from real kind-3 lists), the same number that
          feeds the ranking, so the claim and the maths can't diverge. */}
      <p className="mt-auto px-1 text-[11px] text-slate-500 dark:text-slate-400">
        {author.trustedFollowerCount > 0
          ? `Followed by ${author.trustedFollowerCount} account${author.trustedFollowerCount === 1 ? "" : "s"} you trust`
          : "In your extended network"}
        <span className="text-slate-300 dark:text-slate-600"> · </span>
        {author.hops} hops away
      </p>
    </div>
  );
}
