/**
 * What an account list shows — the login picker's and the in-app switcher's
 * alike: the Accounts this device kept, gathered under the identity each one
 * signs for, every row carrying its Signer and whether that Signer can still be
 * used here.
 *
 * Health is checked where checking is cheap and left to the click where it isn't
 * — an Unlock cache is an AES-GCM decrypt over 32 bytes, an extension either
 * injected or didn't, and a remote signer is a relay round-trip that can hang.
 * Session state is deliberately absent: selecting a row ensures a Session anyway,
 * so saying so in advance would warn about something the click already handles.
 */
import { isAmberSupported } from "./amber";
import { LocalAccount } from "./local-account";
import { getMetadata, isRemembered, type BrainstormAccount } from "./metadata";
import { npubOf } from "./display";

export type SignerKind = "key" | "extension" | "remote" | "amber";

/** What the extension wait has found so far. Judged before it ends, every row lies. */
export type ExtensionPresence = "checking" | "present" | "missing";

/**
 * The state of one row's Signer.
 *
 * - `checking` — the probe hasn't landed; say nothing rather than guess.
 * - `no-backup` — the key opens here and nowhere else: losing this browser loses it.
 * - `key-unavailable` / `extension-missing` / `signer-unusable` — the row can't
 *   sign, and is a marked dead end with its own actions rather than a way in.
 */
export type RowHealth =
  | "checking"
  | "ok"
  | "no-backup"
  | "key-unavailable"
  | "extension-missing"
  | "signer-unusable";

export type PickerRow = {
  account: BrainstormAccount;
  signer: SignerKind;
  health: RowHealth;
  selectable: boolean;
  /** Signed in without "remember me": held for this tab, gone when it closes. */
  sessionOnly: boolean;
};

export type PickerIdentity = {
  pubkey: string;
  npub: string;
  name?: string;
  picture?: string;
  rows: PickerRow[];
};

export function signerKindOf(account: BrainstormAccount): SignerKind {
  if (account instanceof LocalAccount) return "key";
  if (account.type === "extension") return "extension";
  if (account.type === "amber-clipboard") return "amber";
  return "remote";
}

/** Whether a row is a way in, or a dead end that keeps its place and says so. */
export function isSelectable(health: RowHealth): boolean {
  return health === "checking" || health === "ok" || health === "no-backup";
}

/**
 * A Signer we can judge without asking it anything: the extension either injected
 * or it didn't, and one wait answers for every extension row; Amber's clipboard
 * signer works on this device or it doesn't, and no signing in the world changes
 * that. A NIP-46 signer is taken on trust — probing it is a relay round-trip that
 * can hang, so its row looks healthy until the click.
 */
export function signerPresence(kind: SignerKind, extension: ExtensionPresence): RowHealth {
  if (kind === "amber") return isAmberSupported() ? "ok" : "signer-unusable";
  if (kind !== "extension") return "ok";
  if (extension === "checking") return "checking";
  return extension === "present" ? "ok" : "extension-missing";
}

/**
 * Whether losing this browser loses the Account. Not `backupNeed`, which also
 * counts a Backup that was never downloaded: a nag can afford to be early where
 * this warning can't.
 */
export function isUnbackedUp(account: BrainstormAccount | LocalAccount): boolean {
  return (
    account instanceof LocalAccount &&
    !account.signer.data.ncryptsec &&
    !getMetadata(account as unknown as BrainstormAccount).backedUp
  );
}

/**
 * Whether removing this Account destroys the only copy of its key.
 *
 * Not `isUnbackedUp`, which asks whether the key is *portable*. A Backup minted
 * at signup and never downloaded is portable in principle and lives in this
 * browser in fact, so removing the row loses the key exactly as removing one with
 * no Backup at all does. A row chip can afford the finer question; a destructive
 * confirmation cannot, and this is the state the product steers people into —
 * the backup step is skippable and the card that follows it says "later".
 */
export function removalLosesKey(account: BrainstormAccount): boolean {
  return account instanceof LocalAccount && !getMetadata(account).backedUp;
}

/**
 * A Backup means the row works — it just asks for a password. Only without one
 * does the Unlock cache decide, and only then is it opened.
 */
export async function localKeyHealth(account: LocalAccount): Promise<RowHealth> {
  if (account.signer.data.ncryptsec) return "ok";
  if (!(await account.signer.probeUnlockCache())) return "key-unavailable";
  return isUnbackedUp(account) ? "no-backup" : "ok";
}

/** How this Account's Signer looks from here, right now. */
export async function healthOf(
  account: BrainstormAccount,
  extension: ExtensionPresence,
): Promise<RowHealth> {
  return account instanceof LocalAccount
    ? localKeyHealth(account)
    : signerPresence(signerKindOf(account), extension);
}

/**
 * The same list, guaranteed to contain the Active Account.
 *
 * The login picker lists Remembered Accounts only: the rest die with the tab, and
 * offering one at sign-in would be offering something that won't be there. The
 * switcher passes `includeSessionOnly`, so this is the backstop rather than the
 * rule — an Active Account with no row at all would make the pane look broken,
 * and this one is healthy by construction because it is signing right now.
 *
 * It joins its identity where that identity is already listed under another
 * Signer, rather than appearing as a second heading for the same face.
 */
export function withActiveAccount(
  identities: PickerIdentity[],
  active: BrainstormAccount | null | undefined,
): PickerIdentity[] {
  if (!active) return identities;
  if (identities.some((identity) => identity.rows.some((row) => row.account.id === active.id))) {
    return identities;
  }

  const row: PickerRow = {
    account: active,
    signer: signerKindOf(active),
    health: "ok",
    selectable: false,
    sessionOnly: !isRemembered(active),
  };
  const listed = identities.find((identity) => identity.pubkey === active.pubkey);
  if (listed) {
    return identities.map((identity) =>
      identity === listed ? { ...identity, rows: [...identity.rows, row] } : identity,
    );
  }

  const metadata = getMetadata(active);
  return [
    {
      pubkey: active.pubkey,
      npub: npubOf(active),
      name: metadata.name,
      picture: metadata.picture,
      rows: [row],
    },
    ...identities,
  ];
}

/**
 * The list, grouped. Duplicate npubs stay separate Accounts with separate ids and
 * Sessions — this is presentation, and an identity holding one Signer is a plain
 * row, so the grouping only shows up where it earns its keep.
 */
export function pickerIdentities(
  accounts: BrainstormAccount[],
  health: (account: BrainstormAccount) => RowHealth,
  { includeSessionOnly = false }: { includeSessionOnly?: boolean } = {},
): PickerIdentity[] {
  const identities = new Map<string, PickerIdentity>();

  for (const account of accounts) {
    if (!isRemembered(account) && !includeSessionOnly) continue;

    const metadata = getMetadata(account);
    const identity = identities.get(account.pubkey) ?? {
      pubkey: account.pubkey,
      npub: npubOf(account),
      rows: [],
    };
    // Whichever Signer learned the profile speaks for the identity — they are the
    // same person, and only one of the rows may have been signed in recently.
    identity.name ??= metadata.name;
    identity.picture ??= metadata.picture;
    identities.set(account.pubkey, identity);

    const state = health(account);
    identity.rows.push({
      account,
      signer: signerKindOf(account),
      health: state,
      selectable: isSelectable(state),
      sessionOnly: !isRemembered(account),
    });
  }

  return [...identities.values()];
}
