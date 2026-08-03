import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccounts } from "applesauce-react/hooks";

import { LocalAccount } from "@/accounts/local-account";
import { waitForExtension } from "@/accounts/login";
import { isRemembered, type BrainstormAccount } from "@/accounts/metadata";
import {
  localKeyHealth,
  pickerIdentities,
  signerKindOf,
  signerPresence,
  type ExtensionPresence,
  type PickerIdentity,
  type RowHealth,
} from "@/accounts/picker";

export type LoginPickerState = {
  identities: PickerIdentity[];
  /** Look for the extension again — one wait answers for every extension row. */
  recheckExtension: () => void;
};

/**
 * The login picker's rows, healthy where we can cheaply tell. Two probes run
 * behind it: the extension wait, which every extension row shares, and the
 * Unlock cache, which is a decrypt over 32 bytes per local key. Until each lands
 * its rows say nothing — an extension judged before the wait is over reads as
 * missing when it was only late.
 */
export function useLoginPicker(): LoginPickerState {
  const accounts = useAccounts() as BrainstormAccount[];
  const [extension, setExtension] = useState<ExtensionPresence>("checking");
  const [keys, setKeys] = useState<Record<string, RowHealth>>({});

  useEffect(() => {
    if (extension !== "checking") return;
    let live = true;
    void waitForExtension().then((found) => {
      if (live) setExtension(found ? "present" : "missing");
    });
    return () => {
      live = false;
    };
  }, [extension]);

  // Only the local keys are probed, and only when the list itself changes: the
  // extension answer arriving later must not re-open every envelope again.
  useEffect(() => {
    let live = true;
    void Promise.all(
      accounts
        .filter((account) => isRemembered(account) && account instanceof LocalAccount)
        .map(async (account) => [account.id, await localKeyHealth(account as LocalAccount)] as const),
    ).then((entries) => {
      if (live) setKeys(Object.fromEntries(entries));
    });
    return () => {
      live = false;
    };
  }, [accounts]);

  const identities = useMemo(
    () =>
      pickerIdentities(accounts, (account) =>
        account instanceof LocalAccount
          ? keys[account.id] ?? "checking"
          : signerPresence(signerKindOf(account), extension),
      ),
    [accounts, extension, keys],
  );

  const recheckExtension = useCallback(() => setExtension("checking"), []);

  return { identities, recheckExtension };
}
