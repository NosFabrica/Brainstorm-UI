/**
 * The Active Account as the UI shows it: the display cache on its metadata, plus
 * the admin claim its Session carries. v1 kept a parallel copy in localStorage
 * and a custom event to announce it changing; here the Account is the source, so
 * what persists and what the header renders can't disagree.
 */
import type { AccountManager, BaseAccount } from "applesauce-accounts";
import { npubEncode } from "nostr-tools/nip19";
import { distinctUntilChanged, map, of, startWith, switchMap, type Observable } from "rxjs";

import { accountManager } from "@/accounts";
import { getMetadata, updateMetadata, type AccountMetadata, type BrainstormAccount } from "./metadata";
import { isAdmin } from "./session";

export type AccountDisplay = {
  pubkey: string;
  npub: string;
  displayName?: string;
  picture?: string;
  nip05?: string;
  /** From this Account's Session, minted with its token — never guessed from a pubkey. */
  isAdmin: boolean;
};

/** The stored npub. Encoding is the fallback, not the per-render norm. */
export function npubOf(account: BrainstormAccount): string {
  const stored = getMetadata(account).npub;
  if (stored) return stored;
  try {
    return npubEncode(account.pubkey);
  } catch {
    return "";
  }
}

export function displayNameOf(account: BrainstormAccount): string | undefined {
  return getMetadata(account).name;
}

export function pictureOf(account: BrainstormAccount): string | undefined {
  return getMetadata(account).picture;
}

export function displayOf(account: BrainstormAccount): AccountDisplay {
  return {
    pubkey: account.pubkey,
    npub: npubOf(account),
    displayName: displayNameOf(account),
    picture: pictureOf(account),
    nip05: getMetadata(account).nip05,
    isAdmin: isAdmin(account),
  };
}

/** The Active Account's display, for code that isn't a component. */
export function activeDisplay(): AccountDisplay | null {
  const account = accountManager.active;
  return account ? displayOf(account) : null;
}

/** The signed-in pubkey, or null — the most-asked question in the app. */
export function activePubkey(): string | null {
  return accountManager.active?.pubkey ?? null;
}

/** What a kind-0 contributes to the display cache. */
export type ProfileDisplay = { name?: string; picture?: string; nip05?: string };

const PROFILE_FIELDS = ["name", "picture", "nip05"] as const;

/**
 * Cache a profile on the Account, so the next load renders the avatar before any
 * relay answers. Fields the caller doesn't mention are left alone; ones it
 * mentions as empty are cleared, which is how a removed avatar disappears. An
 * unchanged profile writes nothing — `metadata$` drives both the save
 * subscription and every header, and neither needs waking for it.
 */
export function rememberProfile(account: BrainstormAccount, profile: ProfileDisplay): void {
  const metadata = getMetadata(account);
  const patch: Partial<AccountMetadata> = {};
  for (const field of PROFILE_FIELDS) {
    if (!(field in profile)) continue;
    const value = profile[field] || undefined;
    if (value !== metadata[field]) patch[field] = value;
  }
  if (Object.keys(patch).length === 0) return;
  updateMetadata(account, patch);
}

/** Everything a display is made of, flattened — so an unrelated write doesn't re-render the app. */
function signature(display: AccountDisplay | null): string {
  if (!display) return "";
  const { pubkey, npub, displayName, picture, nip05, isAdmin } = display;
  return [pubkey, npub, displayName, picture, nip05, isAdmin].join("|");
}

/**
 * The Active Account's display over time. Flattens `metadata$` as well as
 * `active$`: the profile arrives *after* login and only touches metadata, which
 * is exactly the update the header used to need a custom event bus for.
 */
export function displayStream(manager: AccountManager<AccountMetadata>): Observable<AccountDisplay | null> {
  return manager.active$.pipe(
    switchMap((account) =>
      account
        ? (account as BaseAccount<any, any, AccountMetadata>).metadata$.pipe(
            startWith(null),
            map(() => displayOf(account as BrainstormAccount)),
          )
        : of(null),
    ),
    distinctUntilChanged((a, b) => signature(a) === signature(b)),
  );
}
