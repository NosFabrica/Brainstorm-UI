/**
 * A search tab's chip rows above its results — the Events tab's When, Issues' and PRs' states
 * and labels, the Live shelves (or, with nothing on any, the shape held or the empty word), the
 * Articles, Recipes, Shop and Apps facets — each counted by components/search/pipelines and
 * picked in components/search/SearchResults. The Media tab's row (MediaFacetRow) stands above
 * the results and whatever stands in for them.
 */
import { Fragment, type Dispatch, type SetStateAction } from "react";
import { Radio } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { FacetChip, FacetRow } from "@/components/search/sections";
import { EVENT_WHEN_LABELS, EVENT_WHEN_ORDER, type EventWhen, type eventWhenCounts } from "@/lib/eventFilters";
import { GIT_STATE_LABEL, type GitState } from "@/lib/gitStatus";
import type { LiveState } from "@/lib/liveStream";
import type { BtcRates, PriceBand } from "@/lib/exchangeRate";
import type { useVerifiedRecordings } from "@/hooks/useVerifiedRecordings";
import { MEDIA_KIND_LABELS, MEDIA_KIND_ORDER, type MediaKind } from "@/lib/mediaKind";
import { MEDIA_FACET_LABELS, type MediaFacet } from "@/lib/mediaFacet";
import type { SearchHit, SearchSnapshot, SearchTab } from "@/services/search";
import { isGitItemTab } from "./tabKinds";
import type { DisplayRow } from "./pipelines";
import { ARTICLE_TYPE_LABEL, type ArticleType } from "./pipelines/articles";
import type { LiveCounts } from "./pipelines/live";
import type { Facet } from "./pipelines/types";

type Setter<T> = Dispatch<SetStateAction<T>>;

export interface TabFacetRowsProps {
  tab: SearchTab;
  query: string;
  snapshot: SearchSnapshot | null;
  /** The tab's hits before its chips, after them, and its rows. */
  rawHits: readonly SearchHit[];
  hits: readonly SearchHit[];
  displayHits: readonly DisplayRow[];
  /** Whose page a person scope makes it. */
  scopedTo: string | null;
  eventCounts: ReturnType<typeof eventWhenCounts> | null;
  effectiveWhen: EventWhen;
  setEventWhen: Setter<EventWhen>;
  eventsFellBack: boolean;
  repoStateFacets: Facet<GitState>[];
  repoLabelFacets: Facet[];
  repoState: GitState | null;
  setRepoState: Setter<GitState | null>;
  repoLabel: string | null;
  setRepoLabel: Setter<string | null>;
  liveShowable: boolean;
  liveCounts: LiveCounts;
  effectiveShelf: LiveState;
  setLiveShelf: Setter<LiveState | null>;
  proofs: ReturnType<typeof useVerifiedRecordings>;
  articleFacets: ArticleType[];
  articleType: ArticleType | null;
  setArticleType: Setter<ArticleType | null>;
  recipeFacets: Facet[];
  recipeTopic: string | null;
  setRecipeTopic: Setter<string | null>;
  shopFacets: Facet[];
  shopCategory: string | null;
  setShopCategory: Setter<string | null>;
  rates: BtcRates | null;
  bands: readonly PriceBand[];
  shopPrice: PriceBand["key"] | null;
  setShopPrice: Setter<PriceBand["key"] | null>;
  appFacets: Facet[];
  appCategoryFacets: Facet[];
  appPlatform: string | null;
  setAppPlatform: Setter<string | null>;
  appCategory: string | null;
  setAppCategory: Setter<string | null>;
}

export function TabFacetRows({
  tab,
  eventCounts,
  effectiveWhen,
  setEventWhen,
  eventsFellBack,
  displayHits,
  repoStateFacets,
  repoLabelFacets,
  repoState,
  setRepoState,
  repoLabel,
  setRepoLabel,
  liveShowable,
  hits,
  snapshot,
  proofs,
  scopedTo,
  query,
  liveCounts,
  effectiveShelf,
  setLiveShelf,
  articleFacets,
  articleType,
  setArticleType,
  recipeFacets,
  recipeTopic,
  setRecipeTopic,
  shopFacets,
  shopCategory,
  setShopCategory,
  rates,
  rawHits,
  bands,
  shopPrice,
  setShopPrice,
  appFacets,
  appCategoryFacets,
  appPlatform,
  setAppPlatform,
  appCategory,
  setAppCategory,
}: TabFacetRowsProps) {
  return (
    <>
      {tab === "events" && eventCounts && (
        <div className="mb-2.5">
          <FacetRow testId="event-facets">
            {EVENT_WHEN_ORDER.filter(
              (when) => !((when === "today" || when === "weekend") && eventCounts[when] === 0),
            ).map((when) => (
              <FacetChip
                key={when}
                pressed={effectiveWhen === when}
                onClick={() => setEventWhen(when)}
                count={eventCounts[when]}
                testId={`event-facet-${when}`}
              >
                {EVENT_WHEN_LABELS[when]}
              </FacetChip>
            ))}
          </FacetRow>
          {eventsFellBack && (
            <p className="mt-1 px-1 text-xs text-slate-400 dark:text-slate-500" data-testid="event-facets-note">
              No upcoming events for this search — showing past events.
            </p>
          )}
          {displayHits.length === 0 && !eventsFellBack && (
            <p className="mt-1 px-1 text-xs text-slate-400 dark:text-slate-500" data-testid="event-facets-empty">
              No {EVENT_WHEN_LABELS[effectiveWhen].toLowerCase()} events here — try another window.
            </p>
          )}
        </div>
      )}
      {isGitItemTab(tab) && (repoStateFacets.length > 0 || repoLabelFacets.length > 0) && (
        <FacetRow className="mb-2" testId="repo-state-facets">
          <button
            type="button"
            onClick={() => setRepoState(null)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${repoState === null ? "border-brand-primary bg-brand-primary/10 text-brand-deep dark:text-brand-link" : "border-slate-200 text-slate-600 hover:border-brand-accent/40 dark:border-slate-700 dark:text-slate-300"}`}
            data-testid="repo-state-all"
          >
            All
          </button>
          {repoStateFacets.map(([st]) => (
            <button
              key={st}
              type="button"
              onClick={() => setRepoState(repoState === st ? null : st)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${repoState === st ? "border-brand-primary bg-brand-primary/10 text-brand-deep dark:text-brand-link" : "border-slate-200 text-slate-600 hover:border-brand-accent/40 dark:border-slate-700 dark:text-slate-300"}`}
              data-testid={`repo-state-${st}`}
            >
              {GIT_STATE_LABEL[st]}
            </button>
          ))}
          {repoStateFacets.length > 0 && repoLabelFacets.length > 0 && (
            <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
          )}
          {repoLabelFacets.map(([label]) => (
            <button
              key={label}
              type="button"
              onClick={() => setRepoLabel(repoLabel === label ? null : label)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${repoLabel === label ? "border-brand-primary bg-brand-primary/10 text-brand-deep dark:text-brand-link" : "border-slate-200 text-slate-600 hover:border-brand-accent/40 dark:border-slate-700 dark:text-slate-300"}`}
              data-testid={`repo-label-${label}`}
            >
              {label}
            </button>
          ))}
        </FacetRow>
      )}
      {tab === "live" &&
        !liveShowable &&
        hits.length > 0 &&
        // Nothing on any shelf yet. While the relay or the proofs are still
        // answering, hold the shape; once they have, say so — never a blank
        // page under a count of eleven (Joe Martin's stale "live" pair).
        (!snapshot?.eose || proofs.pending > 0 ? (
          <div
            className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3"
            data-testid="live-skeleton"
            aria-hidden="true"
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-video rounded-xl bg-slate-200 dark:bg-slate-800" />
                <div className="mt-2 h-3 w-3/4 rounded-full bg-slate-200 dark:bg-slate-800" />
                <div className="mt-1.5 h-2.5 w-1/2 rounded-full bg-slate-100 dark:bg-slate-800/70" />
              </div>
            ))}
          </div>
        ) : (
          <div
            className="mt-2 rounded-2xl border border-slate-100 bg-white/60 p-2 dark:border-slate-800/60 dark:bg-slate-900/60"
            data-testid="live-empty"
          >
            <EmptyState
              icon={Radio}
              compact
              title={
                scopedTo
                  ? "Nothing live from them right now"
                  : query.trim()
                    ? `Nothing live for “${query.trim()}” right now`
                    : "Nothing live right now"
              }
              description={`${hits.length} past ${hits.length === 1 ? "stream" : "streams"} matched, but none is on air, scheduled, or left a recording.`}
            />
          </div>
        ))}
      {tab === "live" && liveShowable && (
        <FacetRow className="mb-3" testId="live-facets">
          {(["live", "upcoming", "replay"] as LiveState[])
            .filter((st) => liveCounts[st] > 0)
            .map((st) => (
              <FacetChip
                key={st}
                pressed={effectiveShelf === st}
                onClick={() => setLiveShelf(st)}
                count={liveCounts[st]}
                testId={`live-facet-${st === "replay" ? "replays" : st}`}
              >
                {st === "live" ? "Live" : st === "upcoming" ? "Upcoming" : "Replays"}
              </FacetChip>
            ))}
        </FacetRow>
      )}
      {tab === "articles" && articleFacets.length > 0 && (
        <FacetRow className="mb-2" testId="article-facets">
          <button
            type="button"
            onClick={() => setArticleType(null)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              articleType === null
                ? "border-brand-primary bg-brand-primary/10 text-brand-deep dark:text-brand-link"
                : "border-slate-200 text-slate-600 hover:border-brand-accent/40 dark:border-slate-700 dark:text-slate-300"
            }`}
            data-testid="article-facet-all"
          >
            All
          </button>
          {articleFacets.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setArticleType((cur) => (cur === t ? null : t))}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                articleType === t
                  ? "border-brand-primary bg-brand-primary/10 text-brand-deep dark:text-brand-link"
                  : "border-slate-200 text-slate-600 hover:border-brand-accent/40 dark:border-slate-700 dark:text-slate-300"
              }`}
              data-testid={`article-facet-${t}`}
            >
              {ARTICLE_TYPE_LABEL[t]}
            </button>
          ))}
        </FacetRow>
      )}
      {tab === "recipes" && recipeFacets.length > 0 && (
        <FacetRow className="mb-2" testId="recipe-facets">
          <button
            type="button"
            onClick={() => setRecipeTopic(null)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              recipeTopic === null
                ? "border-brand-primary bg-brand-primary/10 text-brand-deep dark:text-brand-link"
                : "border-slate-200 text-slate-600 hover:border-brand-accent/40 dark:border-slate-700 dark:text-slate-300"
            }`}
            data-testid="recipe-facet-all"
          >
            All
          </button>
          {recipeFacets.map(([topic]) => (
            <button
              key={topic}
              type="button"
              onClick={() => setRecipeTopic((cur) => (cur === topic ? null : topic))}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                recipeTopic === topic
                  ? "border-brand-primary bg-brand-primary/10 text-brand-deep dark:text-brand-link"
                  : "border-slate-200 text-slate-600 hover:border-brand-accent/40 dark:border-slate-700 dark:text-slate-300"
              }`}
              data-testid={`recipe-facet-${topic}`}
            >
              {topic}
            </button>
          ))}
        </FacetRow>
      )}
      {tab === "shop" && shopFacets.length > 0 && (
        <FacetRow className="mb-2" testId="shop-facets">
          <button
            type="button"
            onClick={() => setShopCategory(null)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              shopCategory === null
                ? "border-brand-primary bg-brand-primary/10 text-brand-deep dark:text-brand-link"
                : "border-slate-200 text-slate-600 hover:border-brand-accent/40 dark:border-slate-700 dark:text-slate-300"
            }`}
            data-testid="shop-facet-all"
          >
            All
          </button>
          {shopFacets.map(([cat]) => (
            <button
              key={cat}
              type="button"
              onClick={() => setShopCategory((cur) => (cur === cat ? null : cat))}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                shopCategory === cat
                  ? "border-brand-primary bg-brand-primary/10 text-brand-deep dark:text-brand-link"
                  : "border-slate-200 text-slate-600 hover:border-brand-accent/40 dark:border-slate-700 dark:text-slate-300"
              }`}
              data-testid={`shop-facet-${cat}`}
            >
              {cat}
            </button>
          ))}
        </FacetRow>
      )}
      {tab === "shop" && rates && rawHits.length > 0 && (
        <FacetRow className="mb-2" testId="shop-price-facets">
          {bands.map((b) => (
            <FacetChip
              key={b.key}
              pressed={shopPrice === b.key}
              onClick={() => setShopPrice((cur) => (cur === b.key ? null : b.key))}
              testId={`shop-price-${b.key}`}
            >
              {b.label}
            </FacetChip>
          ))}
        </FacetRow>
      )}
      {tab === "apps" && (appFacets.length > 0 || appCategoryFacets.length > 0) && (
        <FacetRow className="mb-2" testId="app-facets">
          <button
            type="button"
            onClick={() => setAppPlatform(null)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              appPlatform === null
                ? "border-brand-primary bg-brand-primary/10 text-brand-deep dark:text-brand-link"
                : "border-slate-200 text-slate-600 hover:border-brand-accent/40 dark:border-slate-700 dark:text-slate-300"
            }`}
            data-testid="app-facet-all"
          >
            All
          </button>
          {appFacets.map(([platform]) => (
            <button
              key={platform}
              type="button"
              onClick={() => setAppPlatform((cur) => (cur === platform ? null : platform))}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                appPlatform === platform
                  ? "border-brand-primary bg-brand-primary/10 text-brand-deep dark:text-brand-link"
                  : "border-slate-200 text-slate-600 hover:border-brand-accent/40 dark:border-slate-700 dark:text-slate-300"
              }`}
              data-testid={`app-facet-${platform.toLowerCase()}`}
            >
              {platform}
            </button>
          ))}
          {/* One row, like Repos: platforms, a hairline, then the apps' own
      categories. Licences are a fact for the app page, not a way
      people browse. */}
          {appCategoryFacets.length > 0 && (
            <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
          )}
          {appCategoryFacets.map(([cat]) => (
            <button
              key={cat}
              type="button"
              onClick={() => setAppCategory((cur) => (cur === cat ? null : cat))}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                appCategory === cat
                  ? "border-brand-primary bg-brand-primary/10 text-brand-deep dark:text-brand-link"
                  : "border-slate-200 text-slate-600 hover:border-brand-accent/40 dark:border-slate-700 dark:text-slate-300"
              }`}
              data-testid={`app-cat-facet-${cat}`}
            >
              #{cat}
            </button>
          ))}
        </FacetRow>
      )}
    </>
  );
}

/**
 * The Media tab's chips: Videos and Classic Vines change what is asked (`chooseMediaFacet`), and
 * Photos and Audio sort through the loaded page, offered when it mixes kinds (`mediaCounts`).
 */
export function MediaFacetRow({
  mediaFacet,
  pageKind,
  chooseMediaFacet,
  toggleVideos,
  mediaCounts,
  setMediaKind,
  vines,
}: {
  mediaFacet: MediaFacet | null;
  pageKind: MediaKind | null;
  chooseMediaFacet: (next: MediaFacet | null) => void;
  toggleVideos: () => void;
  mediaCounts: ReadonlyMap<MediaKind, number>;
  setMediaKind: Setter<MediaKind | null>;
  /** Whether Classic Vines is offered: it rewrites the query, so only where there is one to rewrite. */
  vines: boolean;
}) {
  return (
    <FacetRow className="mb-2" testId="media-facets">
      <FacetChip
        pressed={!mediaFacet && pageKind === null}
        onClick={() => chooseMediaFacet(null)}
        testId="media-facet-all"
      >
        All
      </FacetChip>
      {MEDIA_KIND_ORDER.map((kind) => {
        if (kind === "video")
          return (
            <Fragment key={kind}>
              <FacetChip
                pressed={mediaFacet === "videos" || pageKind === "video"}
                onClick={toggleVideos}
                testId="media-facet-video"
              >
                {MEDIA_FACET_LABELS.videos}
              </FacetChip>
              {vines && (
                <FacetChip
                  pressed={mediaFacet === "vines"}
                  onClick={() => chooseMediaFacet(mediaFacet === "vines" ? null : "vines")}
                  testId="media-facet-vines"
                >
                  {MEDIA_FACET_LABELS.vines}
                </FacetChip>
              )}
            </Fragment>
          );
        const count = mediaCounts.get(kind);
        return count === undefined ? null : (
          <FacetChip
            key={kind}
            pressed={pageKind === kind}
            onClick={() => setMediaKind((cur) => (cur === kind ? null : kind))}
            count={count}
            testId={`media-facet-${kind}`}
          >
            {MEDIA_KIND_LABELS[kind]}
          </FacetChip>
        );
      })}
    </FacetRow>
  );
}
