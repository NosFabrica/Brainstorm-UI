/**
 * What the login picker shows: the Accounts this device kept, gathered under the
 * identity each one signs for, every row carrying its Signer and whether that
 * Signer can still be used here.
 *
 * Health is checked where checking is cheap and left to the click where it isn't
 * — an Unlock cache is an AES-GCM decrypt over 32 bytes, an extension either
 * injected or didn't, and a remote signer is a relay round-trip that can hang.
 * Session state is deliberately absent: selecting a row ensures a Session anyway,
 * so saying so in advance would warn about something the click already handles.
 */
import { LocalAccount } from "./local-account";
import { getMetadata, isRemembered, type BrainstormAccount } from "./metadata";
import { npubOf } from "./display";

export type SignerKind = "key" | "extension" | "remote";

/** What the extension wait has found so far. Judged before it ends, every row lies. */
export type ExtensionPresence = "checking" | "present" | "missing";

/**
 * The state of one row's Signer.
 *
 * - `checking` — the probe hasn't landed; say nothing rather than guess.
 * - `no-backup` — the key opens here and nowhere else: losing this browser loses it.
 * - `key-unavailable` / `extension-missing` — the row can't sign, and is a marked
 *   dead end with its own actions rather than a way in.
 */
export type RowHealth = "checking" | "ok" | "no-backup" | "key-unavailable" | "extension-missing";

export type PickerRow = {
  account: BrainstormAccount;
  signer: SignerKind;
  health: RowHealth;
  selectable: boolean;
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
  return "remote";
}

/** Whether a row is a way in, or a dead end that keeps its place and says so. */
export function isSelectable(health: RowHealth): boolean {
  return health !== "key-unavailable" && health !== "extension-missing";
}

/**
 * A Signer we can judge without asking it anything: the extension either injected
 * or it didn't, and one wait answers for every extension row. A remote signer is
 * taken on trust — probing it is a relay round-trip that can hang.
 */
export function signerPresence(kind: SignerKind, extension: ExtensionPresence): RowHealth {
  if (kind !== "extension") return "ok";
  if (extension === "checking") return "checking";
  return extension === "present" ? "ok" : "extension-missing";
}

/**
 * A Backup means the key is recoverable with a password, so the row works — it
 * simply asks for one, and nothing about this device can change that. Only where
 * there is no Backup does the Unlock cache decide, and only then is it opened.
 */
export async function localKeyHealth(account: LocalAccount): Promise<RowHealth> {
  if (account.signer.data.ncryptsec) return "ok";
  return (await account.signer.probeUnlockCache()) ? "no-backup" : "key-unavailable";
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
 * The list, grouped. Duplicate npubs stay separate Accounts with separate ids and
 * Sessions — this is presentation, and an identity holding one Signer is a plain
 * row, so the grouping only shows up where it earns its keep.
 */
export function pickerIdentities(
  accounts: BrainstormAccount[],
  health: (account: BrainstormAccount) => RowHealth,
): PickerIdentity[] {
  const identities = new Map<string, PickerIdentity>();

  for (const account of accounts) {
    if (!isRemembered(account)) continue;

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
    });
  }

  return [...identities.values()];
}
