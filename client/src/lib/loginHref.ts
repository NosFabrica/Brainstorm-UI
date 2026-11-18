/**
 * The sign-in link for the page a reader is on: `/login?next=<path + query>`,
 * so signing in returns them to it. The query is the point — a search lives at
 * `/?q=…`, and without it they'd come back to an empty home. LoginPage reads
 * `next` (getNextPath); the home itself, or /login, needs none.
 */
export function loginHref(path: string, search: string): string {
  if (!path.startsWith("/") || path === "/login") return "/login";
  const here = search ? `${path}?${search.replace(/^\?/, "")}` : path;
  return here === "/" ? "/login" : `/login?next=${encodeURIComponent(here)}`;
}
