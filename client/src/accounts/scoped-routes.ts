/**
 * Where a tab has to go when another tab changes who it is.
 *
 * Most pages are about the network, not about you, so they stay put and
 * re-fetch. These are the ones rendering one identity's own data — leaving them
 * on screen under a new identity would show the previous one's context, which is
 * worse than a redirect.
 */
const OWN_DATA = ["/settings", "/admin", "/agentsuite", "/onboarding", "/setup"];

export const AFTER_SWITCH = "/dashboard";

/** Where to go, or null to stay. `nextNpub` is the identity this tab is now. */
export function leaveScopedRoute(
  location: string,
  { previousNpub, nextNpub }: { previousNpub?: string | null; nextNpub?: string | null } = {},
): string | null {
  const path = location.split(/[?#]/)[0];

  if (OWN_DATA.some((page) => path === page || path.startsWith(`${page}/`))) return AFTER_SWITCH;

  // "my profile" is the same page for both identities, so follow it across
  // rather than dumping the user somewhere they weren't looking.
  if (previousNpub && path === `/profile/${previousNpub}`) {
    return nextNpub ? `/profile/${nextNpub}` : AFTER_SWITCH;
  }

  return null;
}
