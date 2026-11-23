/**
 * The kinds with a look of their own in search (ADR 0007's tier three), as
 * the app's root hands them down (TierThreeProvider → hooks/useListKinds).
 *
 * The root is in the entry chunk, and the kinds' search UI (ListKindSearch:
 * previews, pages, the map, the dropdown rows) is not small, so this holds
 * only what a kind is called and where it sits; every part search draws is a
 * stand-in that loads the real one with the rest of ListKindSearch's chunk.
 * Until then a part draws nothing, as it does when the words find nothing,
 * except a kind's page, which says it is reading. `Warm` waits for the page
 * to go idle before it asks for the chunk, so a first visit's boot doesn't
 * pay for it and a first search usually finds it there.
 *
 * The eager kinds (ListKindSearch's own `LIST_KINDS`) are built from the same
 * `KIND_INFO`, so the two can't disagree on what a kind is or which parts it has.
 */
import { Suspense, useEffect, useState, type ComponentType, type ReactNode } from "react";
import type { ConceptViewKey } from "@/config/dictionary";
import config from "@/config/dictionary.config.json";
import type { ListKindSearch } from "@/hooks/useListKinds";
import { lazyWithReload } from "@/lib/lazyWithReload";

/** The parts of a kind that search draws: components, so each can stand in for the real one. */
export type KindPartName = "Preview" | "Panel" | "PersonMark" | "Page" | "Warm" | "Suggestion";
export type KindParts = Pick<ListKindSearch, "Preview" | "Page" | "Warm" | "Suggestion"> &
  Partial<Pick<ListKindSearch, "Panel" | "PersonMark">>;
export type KindInfo = Omit<ListKindSearch, KindPartName> & {
  /** The optional parts this kind draws; every kind draws the rest. */
  extras: readonly ("Panel" | "PersonMark")[];
};

const views = config.views as Record<ConceptViewKey, string>;

/** The kinds, in the order the Top page shows them when the words name none of them. */
export const KIND_INFO: readonly KindInfo[] = [
  { key: "places", label: "Places", group: "Out & about", community: views.place, extras: ["Panel"] },
  { key: "books", label: "Books", group: "Read & listen", community: views.book, extras: [] },
  {
    key: "github",
    label: "GitHub accounts",
    group: "Build",
    community: views["github-account"],
    extras: ["PersonMark"],
  },
];

/** A kind's info and its parts, as search reads it. */
export function kindOf(info: KindInfo, parts: KindParts): ListKindSearch {
  const { extras, ...rest } = info;
  const kind: ListKindSearch = {
    ...rest,
    Preview: parts.Preview,
    Page: parts.Page,
    Warm: parts.Warm,
    Suggestion: parts.Suggestion,
  };
  if (extras.includes("Panel")) kind.Panel = parts.Panel;
  if (extras.includes("PersonMark")) kind.PersonMark = parts.PersonMark;
  return kind;
}

const loadParts = () => import("@/components/items/ListKindSearch").then((m) => m.KIND_PARTS);

/** A stand-in for one of a kind's parts: the real one once its chunk is here, `fallback` until then. */
function lazyPart<P extends object>(key: string, part: KindPartName, fallback: ReactNode = null): ComponentType<P> {
  const Real = lazyWithReload(() =>
    loadParts().then((parts) => ({ default: parts[key][part] as unknown as ComponentType<P> })),
  ) as unknown as ComponentType<P>;
  function Part(props: P) {
    return (
      <Suspense fallback={fallback}>
        <Real {...props} />
      </Suspense>
    );
  }
  Part.displayName = `Lazy${part}(${key})`;
  return Part;
}

/** How long the page is left to settle before a list is read, when the browser can't say it's idle. */
const WARM_AFTER_MS = 2000;

/** False until the page has gone idle once (or WARM_AFTER_MS has passed, where the browser can't say). */
export function useWhenIdle(): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    const w = window as {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setIdle(true), { timeout: WARM_AFTER_MS * 2 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(() => setIdle(true), WARM_AFTER_MS);
    return () => window.clearTimeout(t);
  }, []);
  return idle;
}

/**
 * Not before the page is idle: the chunk must not compete with the boot. The
 * real Warm then waits for the next idle moment before it reads the list.
 */
function lazyWarm(key: string): ComponentType {
  const Real = lazyPart<object>(key, "Warm");
  function Warm() {
    return useWhenIdle() ? <Real /> : null;
  }
  Warm.displayName = `LazyWarm(${key})`;
  return Warm;
}

function PageLoading({ label }: { label: string }) {
  return (
    <p className="py-12 text-center text-sm text-slate-500 dark:text-slate-400" data-testid="kind-page-loading">
      Reading the {label.toLowerCase()}…
    </p>
  );
}

/** The kinds as the app's root hands them to search: each part loads on first draw. */
export const LIST_KINDS: readonly ListKindSearch[] = KIND_INFO.map((info) =>
  kindOf(info, {
    Preview: lazyPart(info.key, "Preview"),
    Panel: lazyPart(info.key, "Panel"),
    PersonMark: lazyPart(info.key, "PersonMark"),
    Page: lazyPart(info.key, "Page", <PageLoading label={info.label} />),
    Warm: lazyWarm(info.key),
    Suggestion: lazyPart(info.key, "Suggestion"),
  }),
);
