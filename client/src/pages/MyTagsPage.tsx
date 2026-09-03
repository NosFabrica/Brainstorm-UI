import { TagsPageShell } from "@/components/tags/TagsPageShell";
import { YourTagsPanel } from "@/components/tags/YourTagsPanel";

/**
 * `/tags/mine` — the "Yours" view of the Tags page.
 *
 * Briefly lived as a Settings tab. That was the wrong shelf and it's worth
 * recording why, because Settings is a tempting default for anything
 * account-shaped: **nothing on this page is a setting.** "About you" is your
 * public reputation as other people report it, and "What you've said" is a log
 * of permanent, signed, public claims. Neither is configuration you change.
 * The one genuine tags setting — which relays to read — stays in
 * Settings → Trust & search.
 *
 * Sharing `/tags`'s shell rather than standing alone is the adoption argument:
 * anyone who lands on the public catalogue now sees they have a page of their
 * own. Before, discovering it required already knowing to open the account
 * menu.
 *
 * Behind `RequireAuth` at the route, so a logged-out visitor lands on login
 * with `next` pointing here rather than at a dead URL.
 */
export default function MyTagsPage() {
  return (
    <TagsPageShell
      view="mine"
      title="Your tags"
      subtitle="What people say about you, and what you've said about them."
    >
      <YourTagsPanel />
    </TagsPageShell>
  );
}
