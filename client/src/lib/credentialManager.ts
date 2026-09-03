/**
 * Browser password-manager integration (client-side, non-custodial).
 *
 * The product stores a Brainstorm account as a credential in the user's browser/OS
 * password manager so they can be autofilled back in on return. A password manager
 * entry is a `username` + `password` pair; we use:
 *   - username = npub  (public, recognizable, harmless to expose)
 *   - password = the NIP-49 `ncryptsec`  (the encrypted key — safe to store, useless
 *     without the separate decrypt password)
 *
 * Capture is fundamentally heuristic across browsers (a real <form> with a username
 * field + correct `autocomplete` is what most browsers listen to). The one true API,
 * `navigator.credentials.store(PasswordCredential)`, exists ONLY in Chromium and only
 * in a secure context — we use it as a best-effort guaranteed-prompt enhancement and
 * never depend on it. See the plan's "honest ceiling": Chrome full, Firefox via form
 * markup, Safari/iOS may need a manual save (the downloaded backup file is the fallback).
 */

/** Chromium + secure-context check for the PasswordCredential API. */
export function isPasswordCredentialSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "credentials" in navigator &&
    typeof (window as unknown as { PasswordCredential?: unknown }).PasswordCredential === "function" &&
    window.isSecureContext
  );
}

/**
 * Best-effort: ask the browser to store a username/password credential so it syncs
 * and autofills later. Chromium-only; resolves `false` (never throws) everywhere
 * else or on any error. Callers must not block UX on the result.
 *
 * `id` is the credential's username (we pass the npub). `name` is the human label
 * shown in the password-manager list (also the npub, per the firm requirement).
 */
export async function storePasswordCredential(id: string, password: string, name?: string): Promise<boolean> {
  if (!isPasswordCredentialSupported() || !id || !password) return false;
  try {
    const Ctor = (window as unknown as { PasswordCredential: new (data: { id: string; password: string; name?: string }) => Credential }).PasswordCredential;
    const cred = new Ctor({ id, password, name: name ?? id });
    await navigator.credentials.store(cred);
    return true;
  } catch {
    return false;
  }
}
