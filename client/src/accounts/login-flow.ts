/**
 * Signing in, signing out, and the first-run setup that follows a signup.
 *
 * This was the second half of `services/nostr.ts`, which was a relay-fetch layer
 * and a login orchestrator sharing one file — so a change to how relays are read
 * sat in the same 1700 lines as a change to how login works. Its collaborators
 * (`accounts/login`, `accounts/session`, `accounts/restore`) already live here.
 *
 * The arrow points one way: this may import `services/nostr`, and nothing under
 * `accounts/` that `services/nostr` imports may import this. That is the cycle
 * `lib/relayPool.ts` and `lib/eventStore.ts` were pushed down to avoid.
 */
import { nip19, getPublicKey, generateSecretKey } from "nostr-tools";
import { ExtensionMissingError } from "applesauce-signers";

import { cacheProfile, fetchProfile, publishProfile, publishRelayList } from "@/services/nostr";
import { PROFILE_RELAYS } from "@/lib/relays";
import { sessions, SessionTransportError } from "@/accounts/session";
import { LocalAccount } from "@/accounts/local-account";
import { activeAccount } from "@/accounts/signing";
import {
  accountFor,
  accountsFor,
  activateAccount,
  adoptAccount,
  extensionAccount,
  forgetAccount,
  localAccount,
  signOutActiveAccount,
} from "@/accounts/login";
import { updateMetadata, type AccountMetadata, type BrainstormAccount } from "@/accounts/metadata";
import { activePubkey, identityHas, rememberProfile } from "@/accounts/display";
import {
  openPastedKey,
  UNUSABLE_BACKUP_MESSAGE,
  type RestoreFailure,
} from "@/accounts/restore";
import { queryClient } from "@/lib/queryClient";
import { extractAdminFlag } from "@/lib/jwt";
import { recordFollowList } from "@/lib/followStore";
import { clearAccountStorage, clearSessionScopedStorage } from "@/lib/accountStorage";

export type LoginErrorCode =
  | "NO_EXTENSION"
  | "EXTENSION_FAILED"
  | "PERMISSION_DENIED"
  | "SIGN_CANCELLED"
  | "INVALID_NSEC"
  | "SERVER_ERROR";

export class LoginError extends Error {
  code: LoginErrorCode;
  constructor(code: LoginErrorCode, message: string) {
    super(message);
    this.name = "LoginError";
    this.code = code;
  }
}

/** What a completed sign-in hands back. Whoever holds it renders it; nothing caches it. */
export interface NostrUser {
  pubkey: string;
  npub: string;
  displayName?: string;
  isAdmin?: boolean;
}

/** Did the signer's own UI turn us down, rather than something breaking? */
function refusedBySigner(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : "").toLowerCase();
  return message.includes("denied") || message.includes("rejected") || message.includes("cancel");
}

/**
 * Authenticate an Account and adopt it as the one that signs. The Account is only
 * adopted once the backend has accepted it, so a failed login leaves nothing
 * behind.
 */
async function signIn(account: BrainstormAccount, metadata: AccountMetadata): Promise<NostrUser> {
  const token = await sessions.authenticate(account);
  // The previous Account stays: signing in adds an identity rather than replacing
  // one, which is what the login picker lists. Sign-out is what lets one go.
  //
  // Its cached answers don't stay, though. `adoptAccount` makes this Account the
  // Active one, so every query still holding the previous identity's connections,
  // scores and settings would answer for it under the new name until something
  // happened to refetch. Cleared before the swap, not after, for the same reason
  // `signInWithAccount` does: afterwards is already too late.
  if (activePubkey() !== account.pubkey) queryClient.clear();
  adoptAccount(account, { ...metadata, npub: nip19.npubEncode(account.pubkey) });
  return completeLogin(account, token);
}

async function completeLogin(account: BrainstormAccount, token: string): Promise<NostrUser> {
  const pubkey = account.pubkey;
  const npub = nip19.npubEncode(pubkey);

  // Load the authoritative contact list (kind 3) once at login and persist it as
  // the known-follows floor, so the follow handlers can never publish a list
  // shorter than what the user actually follows (wipe guard). Fire-and-forget.
  void import("@/services/socialActions")
    .then((m) => m.fetchContactList(pubkey))
    .then((ev) => { if (ev) recordFollowList(pubkey, ev as any); })
    .catch(() => {});

  // Start fetching the user's profile metadata (kind 0) immediately at login
  // instead of deferring it to the dashboard. This removes the dashboard-mount
  // delay from the time-to-avatar. Fire-and-forget so login is never blocked on
  // relay latency; caching it on the Account is what the header renders from.
  void fetchProfile(pubkey)
    .then((content) => { if (content) cacheProfile(content, pubkey); })
    .catch(() => {});

  return { pubkey, npub, isAdmin: extractAdminFlag(token) };
}

export async function handleLogin(): Promise<NostrUser> {
  let account: BrainstormAccount;
  try {
    // Also the extension wait: the constructor asks for a pubkey, so an extension
    // that never appears or refuses fails here rather than at the first publish.
    account = await extensionAccount();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (err instanceof ExtensionMissingError) {
      throw new LoginError(
        "NO_EXTENSION",
        "No sign-in extension detected. You can use your key instead, or add a browser sign-in extension."
      );
    }
    if (refusedBySigner(err)) {
      throw new LoginError(
        "PERMISSION_DENIED",
        "Your extension denied the request. Unlock it and approve access, or use your key."
      );
    }
    throw new LoginError(
      "EXTENSION_FAILED",
      `Your sign-in extension didn't respond${msg ? `: ${msg}` : ""}. Unlock it and try again, or use your key.`
    );
  }

  try {
    // The extension holds the key → recoverable, so the backup nags leave it alone.
    return await signIn(account, { remembered: true, backedUp: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (err instanceof SessionTransportError) {
      throw new LoginError("SERVER_ERROR", msg || "Failed to reach server.");
    }
    if (refusedBySigner(err)) {
      throw new LoginError(
        "SIGN_CANCELLED",
        "Signing was cancelled. Approve the request in your extension, or use your key."
      );
    }
    throw new LoginError(
      "EXTENSION_FAILED",
      `Your extension couldn't sign you in${msg ? `: ${msg}` : ""}. Try again, or use your key.`
    );
  }
}

/**
 * Sign in with an Account whose Signer holds the key somewhere else — a NIP-46
 * remote signer, or Amber over intents. Remembered, because the whole point of
 * both is staying signed in across a reload; and backed up by construction,
 * since this device never had a key to lose.
 */
export function signInWithExternalSigner(account: BrainstormAccount): Promise<NostrUser> {
  return signIn(account, { remembered: true, backedUp: true });
}

/**
 * Sign in as an Account this device already holds — what a login-picker row and
 * the in-app switcher both do. The Session comes first: an Account whose Signer
 * refuses must not leave the app switched to an identity it can't use. A declined
 * unlock travels back out untouched, because a deliberate no is not a failed
 * sign-in.
 *
 * The cache is cleared between the two, not after: once `activateAccount` returns,
 * every query in it answers for the identity that just left.
 */
export async function signInWithAccount(account: BrainstormAccount): Promise<NostrUser> {
  const token = await sessions.ensureSession(account);
  if (activePubkey() !== account.pubkey) queryClient.clear();
  activateAccount(account);
  return completeLogin(account, token);
}

/**
 * Let an Account go for good: it leaves this device, key and all. Where it was
 * the one signing, the Session goes with it — which sign-out no longer does, and
 * this is the only act that still should.
 *
 * Returns whether that signed the user out, so the caller knows to leave a page
 * scoped to an identity this browser no longer holds.
 */
export function removeAccountFromDevice(account: BrainstormAccount): boolean {
  const wasActive = activeAccount()?.id === account.id;
  if (wasActive) logout();
  forgetAccount(account);
  // The per-account rows are keyed by identity, and one identity can hold more
  // than one Account — an extension row and a local row for the same key. Wiping
  // them here while a sibling still signs as that identity would take its
  // follow-wipe guard and its prefs with it.
  if (accountsFor(account.pubkey).length === 0) clearAccountStorage(account.pubkey);
  return wasActive;
}

/**
 * Shared login core: take a raw secret key, hand it to an Account that signs the
 * server's challenge LOCALLY (the key never leaves the device), and complete the
 * session. `opts.persistent` is "stay signed in" — a Remembered Account.
 */
async function authenticateWithSecretKey(
  sk: Uint8Array,
  opts?: { persistent?: boolean; ncryptsec?: string; recoveryPassword?: string },
): Promise<NostrUser> {
  let account: LocalAccount;
  try {
    account = await localAccount(sk, {
      ncryptsec: opts?.ncryptsec,
      password: opts?.recoveryPassword,
    });
  } catch {
    throw new LoginError("INVALID_NSEC", "We couldn't read a valid account from that key.");
  }

  try {
    // The user supplied their own key → they demonstrably hold it, so the account
    // is recoverable and the backup nags leave it alone.
    return await signIn(account, { remembered: !!opts?.persistent, backedUp: true });
  } catch (err) {
    throw asLoginError(err);
  }
}

/** A failed exchange in v1's taxonomy. A key we hold can only fail at the server. */
function asLoginError(err: unknown): LoginError {
  if (err instanceof LoginError) return err;
  const message = err instanceof Error ? err.message : "";
  return new LoginError("SERVER_ERROR", message || "Server error during login.");
}

/**
 * What a failed paste is told. `unusable-backup` is the one that matters: it is
 * a correct password against a key this browser hasn't the memory to open, and
 * calling it wrong would tell someone their password is wrong forever.
 */
const RESTORE_MESSAGES: Record<RestoreFailure, string> = {
  empty: "Please paste your key to continue.",
  unreadable: "That doesn't look like a valid key. Double-check it and try again.",
  "no-password": "Enter the password for this backup.",
  "wrong-password": "Wrong password, or this isn't a valid backup key.",
  "unusable-backup": UNUSABLE_BACKUP_MESSAGE,
};

/**
 * Sign in from whatever was pasted — a raw nsec, or an encrypted Backup and its
 * password, either as the bare token or the whole backup file around it. Every
 * file this app has ever written prints restore steps that end in this box.
 *
 * A Backup arrives with the account: it is stored verbatim, at the work factor
 * whoever minted it chose, so the file the user still holds keeps opening it.
 */
export async function loginWithPastedKey(
  pasted: string,
  password?: string,
  opts?: { persistent?: boolean; recoveryPassword?: string },
): Promise<NostrUser> {
  const opened = openPastedKey(pasted, password);
  if (!opened.ok) throw new LoginError("INVALID_NSEC", RESTORE_MESSAGES[opened.reason]);

  // `persistent` is "Remember me on this device" — it keeps the account across
  // reloads. Without an Unlock cache that needs a Recovery password: it is the
  // only at-rest form a pasted plaintext key can be given.
  return authenticateWithSecretKey(opened.secretKey, {
    persistent: opts?.persistent,
    ncryptsec: opened.ncryptsec,
    recoveryPassword: opts?.recoveryPassword,
  });
}


/**
 * Sign out the Active Account. The Session ends and nothing signs, but the
 * Account keeps its place in the picker with its key at rest — signing back in is
 * one tap. Letting an Account go for good is `removeAccountFromDevice`.
 */
export function logout() {
  const prevPubkey = activePubkey();
  signOutActiveAccount();
  queryClient.clear();

  // The Account's own per-Session state goes with the Session, from the registry
  // rather than a list kept here. What it keeps on this device stays: it is still
  // listed, and signing back in should find its follows and prefs where it left them.
  if (prevPubkey) clearSessionScopedStorage(prevPubkey);
  // Not per-Account: this one says "somebody has scored on this browser", which is
  // what the public pages render, so it must not survive into an anonymous visit.
  try { localStorage.removeItem("brainstorm_calc_completed"); } catch { /* ignore */ }
}

/**
 * The "magic finish": after an account exists, best-effort publish its profile and
 * relay list. Idempotent per pubkey; never blocks or throws. Deliberately does
 * not follow anyone or trigger scoring — see the NOTE below.
 */
export async function runInitialSetup(
  pubkey: string,
  profile: { name: string; about?: string; picture?: string },
  opts: { inviterPubkey?: string } = {},
): Promise<void> {
  if (identityHas(pubkey, "initialSetupDone")) return;

  const content: Record<string, unknown> = { name: profile.name, display_name: profile.name };
  if (profile.about) content.about = profile.about;
  if (profile.picture) content.picture = profile.picture;
  try { await publishProfile(content); } catch {}
  try { await publishRelayList(PROFILE_RELAYS); } catch {}

  // NOTE: we intentionally do NOT publish a seed follow list or trigger scoring
  // here. New users choose who to follow in the post-signup "Build your network"
  // step (/welcome), which publishes their chosen kind-3 and then triggers
  // scoring via `triggerScoringAndAnchor`. Auto-following an account the user
  // didn't choose is both a trust-graph artifact and a wipe risk.

  // If they arrived via an invite link, remember the inviter so /welcome can
  // preselect them among the suggested follows.
  try {
    const inviter = (opts.inviterPubkey || "").toLowerCase();
    if (/^[0-9a-f]{64}$/.test(inviter) && inviter !== pubkey.toLowerCase()) {
      sessionStorage.setItem("brainstorm_pending_invite_hex", inviter);
    }
  } catch {}

  // Bootstrap publishes done — guard against re-running on reload. Resolved now
  // rather than before the publishes, which are slow enough for a switch.
  const account = accountFor(pubkey);
  if (account) updateMetadata(account, { initialSetupDone: true });
}

/**
 * Create a brand-new Brainstorm account: generate a keypair client-side, log in
 * via the existing challenge/verify flow, persist the key locally so the user
 * stays signed in, and fire-and-forget the first-run setup. Mirrors
 * `loginWithPastedKey` but with a generated key.
 *
 * `password` is the Recovery password chosen at signup — it mints the Backup, so
 * the account is portable from birth rather than device-bound until someone
 * remembers to back it up. Minting blocks the main thread for up to a second, so
 * the caller paints its pending state first.
 */
export async function createAccount(
  displayName: string,
  opts: { inviterPubkey?: string; password?: string } = {},
): Promise<NostrUser> {
  const name = displayName.trim();
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);
  const account = await localAccount(sk, { password: opts.password });

  let user: NostrUser;
  try {
    // A brand-new key exists only in this browser, so it is emphatically not
    // backed up — `createdInApp` is what points the onboarding nags at it.
    user = await signIn(account, { remembered: true, createdInApp: true });
  } catch (err) {
    throw asLoginError(err);
  }

  // A brand-new account has no kind-0 on relays yet, so completeLogin returns a
  // nameless user (its profile fetch finds nothing). Apply the name the user
  // just typed right away so the header/profile show it immediately, instead of
  // waiting for the relay round-trip after runInitialSetup publishes.
  if (name) {
    rememberProfile(account, { name });
    user = { ...user, displayName: name };
  }

  // Don't block the UI on relay/scoring work.
  void runInitialSetup(pubkey, { name }, { inviterPubkey: opts.inviterPubkey }).catch(() => {});
  return user;
}
