import { useState } from "react";
import { SearchBox } from "@/components/search/SearchBox";
import { SEARCH_PLACEHOLDER_CLASS } from "@/components/search/searchBoxChrome";

/**
 * The search box away from home: the shared-page header on ≥sm (PublicPageHeader) and the
 * dashboard's lookup. It is the home page's own box (components/search/SearchBox) — same
 * pills, same suggestions, same recents — and a search from it is the box's default
 * trip away from home: straight to a topic, profile or note it names, else `/?q=`.
 */
export function HeaderSearchBox({
  className = "",
  placeholder = "Search Brainstorm",
}: {
  className?: string;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");

  return (
    <SearchBox
      className={className}
      value={q}
      onChange={setQ}
      onClear={() => setQ("")}
      placeholder={<span className={SEARCH_PLACEHOLDER_CLASS}>{placeholder}</span>}
      ariaLabel={placeholder}
    />
  );
}
