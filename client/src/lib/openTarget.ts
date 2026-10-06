/**
 * Where something handed to the installed app should open. Two ways in, one
 * route (`/open`, in App.tsx):
 *
 *   - the share sheet: another app shares a link or some text to Brainstorm
 *     (the manifest's `share_target` sends `title`, `text` and `url`);
 *   - a `web+nostr:` link, which the manifest's `protocol_handlers` sends as
 *     `text` (browsers only let a page claim schemes under `web+`).
 *
 * A Nostr person or event among them opens its page; anything else is searched.
 */
import { resolveEntityToPath } from "./resolveNostrEntity";

export function openTarget(search: string): string {
  const params = new URLSearchParams(search);
  // Share sheets differ in where they put the link: some in `url`, some in `text`.
  const parts = ["url", "text", "title"].map((key) => (params.get(key) ?? "").trim()).filter(Boolean);
  for (const part of parts) {
    const resolved = resolveEntityToPath(part.replace(/^web\+nostr:/i, "nostr:"));
    if (resolved) return resolved.path;
  }
  const query = parts[0];
  return query ? `/?q=${encodeURIComponent(query.slice(0, 500))}` : "/";
}
