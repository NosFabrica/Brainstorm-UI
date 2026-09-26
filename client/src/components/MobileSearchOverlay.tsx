import { useEffect, useState } from "react";
import { SearchBox } from "@/components/search/SearchBox";
import { SEARCH_PLACEHOLDER_CLASS } from "@/components/search/searchBoxChrome";

/** Fire from anywhere (a header magnifier) to open mobile search. */
export const OPEN_MOBILE_SEARCH_EVENT = "open-mobile-search";

export function openMobileSearch() {
  window.dispatchEvent(new Event(OPEN_MOBILE_SEARCH_EVENT));
}

/**
 * Mobile search, as an overlay over the current page.
 *
 * The header magnifier used to be a `<Link href="/">`, so tapping it NAVIGATED
 * AWAY and you lost whatever you were reading — the thread, the profile, your
 * scroll position. Search is a lookup, not a destination, so it belongs over the
 * page rather than instead of it.
 *
 * Not an expanding inline header field, which was the obvious first instinct: the
 * mobile header is ~44px and already carries the wordmark, Share and the avatar, so
 * an inline input leaves ~200px and — the real problem — nowhere to put the recent
 * searches, which are the most useful thing here.
 *
 * Submitting hands off to the existing search page (`/?q=…`, which landing already
 * reads on mount) rather than re-implementing result ranking in a second place.
 *
 * The box is the home page's own (components/search/SearchBox), laid out as a sheet:
 * the same pills, suggestions, recents and Browse row, in flow under the field.
 */

export function MobileSearchOverlay() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    // Every opening starts from an empty box — set with the opening, so the sheet never
    // mounts on the last query and then clears it.
    const onOpen = () => { setQ(""); setOpen(true); };
    window.addEventListener(OPEN_MOBILE_SEARCH_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_MOBILE_SEARCH_EVENT, onOpen);
  }, []);

  // Escape closes; body scroll locks so the page behind doesn't move under the sheet.
  useEffect(() => {
    if (!open) return;
    // An Escape the field already took — closing its calendar or group picker — is not
    // the sheet's to act on.
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented) setOpen(false); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white dark:bg-slate-950" data-testid="mobile-search-overlay">
      <SearchBox
        sheet
        className="min-h-0 flex-1"
        // The input row mirrors the header height it replaces, so the transition reads
        // as the header expanding rather than a new screen appearing.
        rowClassName="border-b border-slate-200 px-3 py-2.5 dark:border-slate-800"
        rowStyle={{ paddingTop: "max(env(safe-area-inset-top), 0.625rem)" }}
        value={q}
        onChange={setQ}
        onClear={() => setQ("")}
        onLeave={() => setOpen(false)}
        autoFocus
        placeholder={<span className={SEARCH_PLACEHOLDER_CLASS}>Search Brainstorm…</span>}
        ariaLabel="Search Brainstorm"
        aside={
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-11 shrink-0 rounded-xl px-3 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            data-testid="mobile-search-close"
          >
            Cancel
          </button>
        }
      />
    </div>
  );
}
