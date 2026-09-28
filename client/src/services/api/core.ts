/**
 * Transport and session: the base URL, the observed `fetch`, the
 * authenticated/optional-auth wrappers, and the two helpers every admin call
 * shares. Domain modules build on this; nothing here knows an endpoint.
 */

import { env } from "@/lib/runtimeEnv";
import {
  clearSession,
  ensureSession,
  getSessionToken,
  isSessionDeferredError,
  refreshSession,
  SessionDeferredError,
} from "@/accounts/session";
import { EXTENSION_COLD_BOOT_WAIT_MS, waitForExtension } from "@/accounts/login";
import { accountManager } from "@/accounts";
import { activeAccount } from "@/accounts/signing";
import { observeApiFetch } from "@/lib/serverStatus";

const RAW_API_URL = env.VITE_API_URL;
const API_BASE_URL = RAW_API_URL.replace(/\/+$/, "");

// Every call in this folder fetches for itself, and several swallow their
// errors into friendly strings — so the one place that sees all of them is
// here: the folder's own `fetch`, which lets the server-status store hear
// each transport failure (lib/serverStatus; the sorry page). A lazy
// delegate, so a test's stubbed global fetch still intercepts. Quiet during
// the 401 redirect, whose aborted requests look like a dead server.
// Domain modules import it from here rather than reaching for the global.
export const fetch: typeof globalThis.fetch = (input, init) =>
  isRedirectingToLogin ? globalThis.fetch(input, init) : observeApiFetch(globalThis.fetch(input, init), String(input));

if (!API_BASE_URL) {
  // eslint-disable-next-line no-console
  console.error(
    "[api] VITE_API_URL is not set. The frontend cannot reach the Brainstorm Backend. " +
      "Set VITE_API_URL at build time (see README and Dockerfile).",
  );
}

// One-time cleanup of the legacy environment-switch key from prior versions.
try {
  localStorage.removeItem("brainstorm_api_env");
} catch {
  // ignore (e.g. SSR / private mode)
}

export function getBrainstormApi(): string {
  return API_BASE_URL;
}

// One-time cleanup of stale Vespa preferences from prior versions.
try {
  localStorage.removeItem("brainstorm_vespa_weights");
  localStorage.removeItem("brainstorm_search_backend");
} catch {
  // ignore
}

let isRedirectingToLogin = false;

export function isAuthRedirecting(): boolean {
  return isRedirectingToLogin;
}

/**
 * The Session ended and could not be renewed. It costs the Active Account its
 * token, not its place on this device — the Account is still listed and signing
 * back in is one tap.
 *
 * The redirect is a last resort, not the response: it is what stops a page
 * rendering an identity the backend just refused, and it is only the right answer
 * when there is nothing else on this device to be. Where another Account is held,
 * leaving the route alone lets the switcher offer it — bouncing to the landing
 * page would throw away a session the user still has. We do not pick the
 * replacement for them; whether that Signer can actually sign is a probe the
 * picker already makes properly.
 */
function handleUnauthorized() {
  const account = activeAccount();
  if (account) clearSession(account);
  if (accountManager.accounts.some((held) => held !== account)) return;
  isRedirectingToLogin = true;
  window.location.href = "/";
}

/** Healed, waiting for the user, or genuinely unusable — three different answers. */
type ReauthResult = "ok" | "deferred" | "failed";

/**
 * Mint a fresh Session for the Active Account, in the background: this is a 401
 * from whatever query happened to fire, not something the user asked for. A
 * Locked Account that would have to ask for a password defers instead — the next
 * user-initiated action mints one. Concurrent 401s share one exchange, so a
 * signer is asked to approve at most once.
 */
async function silentReauth(staleToken?: string): Promise<ReauthResult> {
  const account = activeAccount();
  if (!account) return "failed";
  // Someone else got here first. When a token expires with several queries in
  // flight they all 401, and the ones landing after the first exchange settled
  // are complaining about a token that no longer exists — minting again would
  // cost one signer approval per stale request, and `refreshSession` would clear
  // the fresh token on its way to doing it.
  if (staleToken !== undefined && currentToken() !== undefined && currentToken() !== staleToken) {
    return "ok";
  }
  // A 401 on a cold boot can beat the extension's own injection; v1 waited here too.
  if (account.type === "extension") await waitForExtension(EXTENSION_COLD_BOOT_WAIT_MS);
  try {
    await refreshSession(account, { background: true });
    return "ok";
  } catch (err) {
    return isSessionDeferredError(err) ? "deferred" : "failed";
  }
}

/**
 * Mint the Session the deferred path skipped — the unlock card and the "sign in
 * again" query state both end here. User-initiated, so unlocking on the way
 * through is exactly what was asked for; a declined unlock travels back out.
 */
export async function resumeSession(): Promise<void> {
  const account = activeAccount();
  if (!account) return;
  await ensureSession(account);
}

/** The Active Account's token, or undefined — signed out, or Session-less. */
function currentToken(): string | undefined {
  const account = activeAccount();
  return account && getSessionToken(account);
}

export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  let token = currentToken();
  if (!token) {
    const reauth = await silentReauth();
    // Deferred is not expired: the Account is fine and the key is simply asleep,
    // so nothing is wiped and nobody is redirected. The caller renders the
    // "sign in again to see this" state instead.
    if (reauth === "deferred") throw new SessionDeferredError();
    if (reauth === "failed") {
      handleUnauthorized();
      throw new Error("No session token found");
    }
    token = currentToken();
  }
  const response = await fetch(url, {
    ...options,
    headers: { ...options.headers, access_token: token! },
  });
  if (response.status === 401) {
    const data = await response.json().catch(() => null);
    const detail = data?.detail || data?.message || "";
    const reauth = await silentReauth(token);
    if (reauth === "deferred") throw new SessionDeferredError();
    if (reauth === "ok") {
      const newToken = currentToken();
      const retryResponse = await fetch(url, {
        ...options,
        headers: { ...options.headers, access_token: newToken! },
      });
      if (retryResponse.status === 401 || retryResponse.status === 403) {
        handleUnauthorized();
        throw new Error("Session expired. Please log in again.");
      }
      return retryResponse;
    }
    handleUnauthorized();
    throw new Error(detail || "Session expired. Please log in again.");
  }
  if (response.status === 403) {
    const data = await response.json().catch(() => null);
    const detail = data?.detail || data?.message || "";
    throw new Error(detail || `Request forbidden (${response.status})`);
  }
  return response;
}

/**
 * Fetch that attaches auth when a session exists, but degrades gracefully for
 * anonymous visitors. Used for public, anon-viewable data (profile overview,
 * stats, connections) so the NosFabrica "house" perspective can be served
 * without a login. When a session is present we delegate to
 * `authenticatedFetch` (with silent re-auth + redirect-on-expiry). When there
 * is no session at all we do a plain fetch with NO redirect side effects, so
 * anonymous browsing never wipes localStorage or bounces to the home page.
 */
export async function optionalAuthFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  // An Account with no Session still counts: `authenticatedFetch` mints one, and
  // a deferred mint falls through to the anonymous read below.
  if (activeAccount()) {
    try {
      return await authenticatedFetch(url, options);
    } catch (err) {
      // A deferred Session says nothing about public data. Serve it anonymously
      // rather than leaving a signed-in reader worse off than a signed-out one.
      if (isSessionDeferredError(err)) return fetch(url, options);
      throw err;
    }
  }
  return fetch(url, options);
}

/**
 * Pull the backend's `detail`/`message` off a non-ok JSON response so 4xx/5xx
 * (incl. 409/422) surface a human error. Returns "" if the body isn't JSON.
 */
export async function extractApiError(response: Response): Promise<string> {
  const data = await response.json().catch(() => null);
  return data?.detail || data?.message || "";
}

/**
 * One admin call: authenticate, surface the server's own `detail` on failure,
 * and unwrap the `{ code, data, message }` envelope the older handlers still
 * answer with. `fallback` is the message when the server sent no text; the
 * status is appended to it. An empty body (a 204 on delete) answers undefined.
 */
export async function adminJson<T>(
  path: string,
  fallback: string,
  init: RequestInit = {},
  timeoutMs: number = 15000,
): Promise<T> {
  const response = await authenticatedFetch(`${getBrainstormApi()}${path}`, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(
      (await extractApiError(response)) || `${fallback} (${response.status})`,
    );
  }
  const text = await response.text();
  if (!text) return undefined as T;
  const json = JSON.parse(text);
  return (json?.data ?? json) as T;
}

/** A JSON request body, with the header that makes the server read it. */
export function jsonBody(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
