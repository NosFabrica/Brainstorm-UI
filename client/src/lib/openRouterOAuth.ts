/**
 * "Connect with OpenRouter": OpenRouter's OAuth PKCE flow, which hands this page a key
 * for the user's own OpenRouter account without them copying one
 * (https://openrouter.ai/docs/guides/overview/auth/oauth).
 *
 * 1. `startOpenRouterConnect` (services) keeps a fresh verifier and state in this tab's
 *    sessionStorage and sends the user to `authUrl`.
 * 2. OpenRouter sends them back to `OPENROUTER_CALLBACK_PATH` with `?code=…&state=…`
 *    (no `state` when they declined).
 * 3. The callback page checks the state, trades the code for a key at
 *    `OPENROUTER_KEYS_URL`, and hands the key to the AI model view in memory
 *    (`handOff`): never storage, the URL or a log. The user still presses Save.
 */

export const OPENROUTER_AUTH_URL = "https://openrouter.ai/auth";
export const OPENROUTER_KEYS_URL = "https://openrouter.ai/api/v1/auth/keys";
/** A path without a query, so OpenRouter can append its own. */
export const OPENROUTER_CALLBACK_PATH = "/settings/openrouter";
/** Where the callback lands the user: Settings › Assistants › AI model. */
export const AI_MODEL_SETTINGS_PATH = "/settings?tab=assistants&view=ai";
/** What OpenRouter prefills as the new key's name. */
export const OPENROUTER_KEY_LABEL = "Brainstorm";

const PENDING_KEY = "brainstorm:openrouter-oauth";

export function base64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 32 random bytes, base64url: a PKCE verifier (43 characters), or a state. */
export function randomToken(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/** The S256 challenge: base64url(sha256(verifier)) (RFC 7636 § 4.2). */
export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export function authUrl({
  callbackUrl,
  challenge,
  state,
}: {
  callbackUrl: string;
  challenge: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    callback_url: callbackUrl,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    key_label: OPENROUTER_KEY_LABEL,
  });
  return `${OPENROUTER_AUTH_URL}?${params.toString()}`;
}

/** What went wrong, in words the AI model view shows as they are. */
export type ConnectError = "declined" | "mismatch" | "expired" | "failed";

export const CONNECT_ERROR_TEXT: Record<ConnectError, string> = {
  declined: "OpenRouter didn't give Brainstorm a key. Connect again, or paste a key instead.",
  mismatch: "That OpenRouter sign-in didn't start on this page, so it was ignored. Connect again from here.",
  expired: "The OpenRouter sign-in expired. Connect again.",
  failed: "OpenRouter didn't hand over a key. Connect again, or paste a key instead.",
};

/**
 * The callback's query, checked against what this tab sent. A missing state means the
 * user declined (OpenRouter drops it then); a different one means the sign-in didn't
 * start here.
 */
export function readCallback(
  search: string,
  pending: { state: string } | null,
): { code: string } | { error: ConnectError } {
  const params = new URLSearchParams(search);
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return { error: "declined" };
  if (!pending) return { error: "expired" };
  if (state !== pending.state) return { error: "mismatch" };
  return { code };
}

/** The exchange's answer: `{ key }` on success. Codes expire after 10 minutes. */
export function readExchangeAnswer(httpStatus: number, body: unknown): { key: string } | { error: ConnectError } {
  const key = (body as { key?: unknown } | null)?.key;
  if (httpStatus >= 200 && httpStatus < 300 && typeof key === "string" && key) return { key };
  if (httpStatus === 400 || httpStatus === 403 || httpStatus === 404) return { error: "expired" };
  return { error: "failed" };
}

export function exchangeBody(code: string, verifier: string): string {
  return JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" });
}

// ── The verifier and state, for this tab, until the callback ─────────────────────

export type PendingConnect = { verifier: string; state: string };

function session(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function keepPending(pending: PendingConnect): boolean {
  try {
    session()?.setItem(PENDING_KEY, JSON.stringify(pending));
    return session()?.getItem(PENDING_KEY) !== null;
  } catch {
    return false;
  }
}

/** Reads and forgets the pending sign-in: a code is good for one exchange. */
export function takePending(): PendingConnect | null {
  try {
    const raw = session()?.getItem(PENDING_KEY);
    session()?.removeItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingConnect>;
    return typeof parsed.verifier === "string" && typeof parsed.state === "string"
      ? { verifier: parsed.verifier, state: parsed.state }
      : null;
  } catch {
    return null;
  }
}

// ── The handoff to the AI model view: in memory only ─────────────────────────────

export type ConnectOutcome = { key: string } | { error: ConnectError };

let handoff: ConnectOutcome | null = null;

export function handOff(outcome: ConnectOutcome): void {
  handoff = outcome;
}

/** What the last sign-in brought back, without consuming it (StrictMode reads twice). */
export function peekHandoff(): ConnectOutcome | null {
  return handoff;
}

export function clearHandoff(): void {
  handoff = null;
}
