/**
 * The search page's state in its address: the tab (`t`, or a kind's own page), the list
 * narrowing All (`list`) and the tag narrowing it (`tagged`). Read on mount and on Back or
 * Forward, written with replaceState as the reader moves (components/search/SearchResults).
 */
import { useCallback, useEffect, useState } from "react";
import { isClassicVinesTopic } from "@/lib/mediaFacet";
import { splitFilters } from "@/lib/searchSyntax";
import type { SearchTab } from "@/services/search";
import { TAB_KEYS } from "@/components/search/searchTabs";

export function tabFromUrl(): SearchTab {
  try {
    const t = new URLSearchParams(window.location.search).get("t");
    // The old combined tab's deep links keep working.
    if (t === "code") return "repos";
    // `everything` was the composed page before it was Top; its links — and the
    // recent searches that saved it — still mean Top, never the raw list.
    if (t === "everything") return "top";
    if (t && TAB_KEYS.has(t as SearchTab)) return t as SearchTab;
  } catch {
    /* default below */
  }
  return "top";
}

/**
 * `#vine-archive` typed alone is the Media tab with Classic Vines chosen (lib/mediaFacet), where
 * any other lone hashtag is a topic page. `query` is the box's words and the panel's tokens.
 */
const opensOnMedia = (query: string): boolean => isClassicVinesTopic(splitFilters(query).text);

/** Does the address name a tab? Top is the default and is written as no tab at all. */
function urlNamesTab(): boolean {
  try {
    return !!new URLSearchParams(window.location.search).get("t");
  } catch {
    return false;
  }
}

/** The tab a page opens on: the URL's, or Media for a query that is Classic Vines and names no tab. */
export function openingTab(query: string): SearchTab {
  return !urlNamesTab() && opensOnMedia(query) ? "media" : tabFromUrl();
}

/** The `t` the URL names when it isn't one of the tabs: a kind's own page, if the app has that kind. */
export function urlKind(): string | null {
  try {
    const t = new URLSearchParams(window.location.search).get("t");
    return t && !TAB_KEYS.has(t as SearchTab) ? t : null;
  } catch {
    return null;
  }
}

/** The list narrowing All (`list`), by its coordinate: kept in the link so Back comes back to it. */
export function urlList(): string | null {
  try {
    return new URLSearchParams(window.location.search).get("list");
  } catch {
    return null;
  }
}

export function writeListToUrl(coordinate: string | null) {
  try {
    const url = new URL(window.location.href);
    if (coordinate) url.searchParams.set("list", coordinate);
    else url.searchParams.delete("list");
    window.history.replaceState({}, "", url.pathname + url.search);
  } catch {
    /* URL sync is a convenience, never a blocker */
  }
}

/** The tag narrowing All's results (`tagged`), by its `<author>|<slug>` key: kept in the link like a list. */
export function urlTagged(): string | null {
  try {
    return new URLSearchParams(window.location.search).get("tagged");
  } catch {
    return null;
  }
}

export function writeTaggedToUrl(key: string | null) {
  try {
    const url = new URL(window.location.href);
    if (key) url.searchParams.set("tagged", key);
    else url.searchParams.delete("tagged");
    window.history.replaceState({}, "", url.pathname + url.search);
  } catch {
    /* URL sync is a convenience, never a blocker */
  }
}

/** A searched map area (`area`) is the Places page's, and a pressed list or tag All's: another page or tab leaves them out of the link. */
export function writeKindToUrl(key: string) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("t", key);
    url.searchParams.delete("area");
    url.searchParams.delete("list");
    url.searchParams.delete("tagged");
    window.history.replaceState({}, "", url.pathname + url.search);
  } catch {
    /* URL sync is a convenience, never a blocker */
  }
}

export function writeTabToUrl(tab: SearchTab) {
  try {
    const url = new URL(window.location.href);
    if (tab === "top") url.searchParams.delete("t");
    else url.searchParams.set("t", tab);
    url.searchParams.delete("area");
    url.searchParams.delete("list");
    url.searchParams.delete("tagged");
    window.history.replaceState({}, "", url.pathname + url.search);
  } catch {
    /* URL sync is a convenience, never a blocker */
  }
}

/**
 * The tab a search page shows, and a kind's own page in its place, as the address says: read on
 * mount, followed on Back and Forward, and written when the reader changes either.
 */
export function useSearchUrlState(query: string): {
  tab: SearchTab;
  /** The kind whose own page is open, as the address names it (hooks/useListKinds). */
  kindTab: string | null;
  changeTab: (next: SearchTab) => void;
  openKind: (key: string) => void;
} {
  const [tab, setTab] = useState<SearchTab>(() => openingTab(query));
  const [kindTab, setKindTab] = useState<string | null>(() => urlKind());
  // On a page already open, `#vine-archive` alone moves it to Media under the same rule as
  // opening on it: only when the address names no tab. An address that names one is a link,
  // Back or Forward saying where to be, or the tab the reader picked, and is not overridden.
  // Decided as the new query renders, so the tab it was on never asks the relay for it.
  const [queryWas, setQueryWas] = useState(query);
  if (query !== queryWas) {
    setQueryWas(query);
    if (tab !== "media" && opensOnMedia(query) && !urlNamesTab()) setTab("media");
  }
  const landsOnMedia = tab === "media" && opensOnMedia(query);
  useEffect(() => {
    // The tab was chosen here, not by a click: the address has to say so for a reload or a link.
    if (landsOnMedia) writeTabToUrl("media");
  }, [landsOnMedia]);
  // Back and Forward say where to be: the page the address names, a kind's or a tab. (A step in
  // history of its own is pushed by the Places page's area search; tabs replace theirs.)
  useEffect(() => {
    const follow = () => {
      setKindTab(urlKind());
      setTab(tabFromUrl());
    };
    window.addEventListener("popstate", follow);
    return () => window.removeEventListener("popstate", follow);
  }, []);
  const changeTab = useCallback((next: SearchTab) => {
    setKindTab(null);
    setTab(next);
    writeTabToUrl(next);
  }, []);
  // A kind's own page (hooks/useListKinds): named in the URL like a tab, shown under the strip in
  // place of the results. The Top page's sections stay unmounted, so nothing is asked of the relay.
  const openKind = useCallback((key: string) => {
    setKindTab(key);
    setTab("top");
    writeKindToUrl(key);
  }, []);
  return { tab, kindTab, changeTab, openKind };
}
