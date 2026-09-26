import { useState } from "react";
import { useLocation } from "wouter";
import { SearchBox } from "@/components/search/SearchBox";
import { SEARCH_PLACEHOLDER_CLASS } from "@/components/search/searchBoxChrome";

/**
 * The search box away from home: the shared-page header on ≥sm (PublicPageHeader) and the
 * dashboard's lookup. It is the home page's own box (components/search/SearchBox) — same
 * pills, same suggestions, same recents — and a search from it is a trip to the home
 * results (`/?q=`), which also resolves a pasted npub, handle or note link.
 */
export function HeaderSearchBox({
  className = "",
  placeholder = "Search Brainstorm",
}: {
  className?: string;
  placeholder?: string;
}) {
  const [, navigate] = useLocation();
  const [q, setQ] = useState("");

  return (
    <SearchBox
      className={className}
      value={q}
      onChange={setQ}
      onSearch={(query) => {
        const words = query.trim();
        if (words) navigate(`/?q=${encodeURIComponent(words)}`);
      }}
      onClear={() => setQ("")}
      onBrowse={(tab) => navigate(`/?t=${encodeURIComponent(tab)}`)}
      placeholder={<span className={SEARCH_PLACEHOLDER_CLASS}>{placeholder}</span>}
      ariaLabel={placeholder}
    />
  );
}
