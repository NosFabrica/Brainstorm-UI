import { Redirect } from "wouter";

/**
 * `/tags/mine` moved into Settings → Tags (`/settings?tab=tags`).
 *
 * Kept as a redirect rather than deleted: the URL was live, linked from the
 * account menu, the profile chip row and the tags guide, and may already have
 * been shared or bookmarked. `replace` so it doesn't wedge the back button —
 * going back from Settings should reach wherever you actually came from.
 *
 * The page's content now lives in `components/settings/YourTagsPanel.tsx`.
 */
export default function MyTagsPage() {
  return <Redirect to="/settings?tab=tags" replace />;
}
