import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AccountManager } from "applesauce-accounts";
import { ExtensionAccount } from "applesauce-accounts/accounts";
import { ExtensionSigner } from "applesauce-signers";
import { AccountsProvider } from "applesauce-react/providers";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";

import { LocalAccount } from "@/accounts/local-account";
import { LocalSigner } from "@/accounts/local-signer";
import { updateMetadata, type AccountMetadata, type BrainstormAccount } from "@/accounts/metadata";
import { createFakeUnlockCache } from "@/accounts/test-fakes";
import { useLoginPicker } from "./useLoginPicker";

const extensionFound = vi.fn<() => Promise<boolean>>();
vi.mock("@/accounts/login", () => ({ waitForExtension: () => extensionFound() }));

function Rows() {
  const { identities } = useLoginPicker();
  return (
    <ul>
      {identities.flatMap((identity) =>
        identity.rows.map((row) => (
          <li key={row.account.id}>{`${identity.name}:${row.signer}:${row.health}`}</li>
        )),
      )}
    </ul>
  );
}

function renderWith(manager: AccountManager<AccountMetadata>) {
  return render(
    <AccountsProvider manager={manager as any}>
      <Rows />
    </AccountsProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  extensionFound.mockResolvedValue(true);
});

describe("the picker's rows", () => {
  it("probes each local key's Unlock cache without unlocking it", async () => {
    const unlockCache = createFakeUnlockCache();
    const key = generateSecretKey();
    const pubkey = getPublicKey(key);
    const envelope = await unlockCache.encrypt(key, pubkey);
    const account = new LocalAccount(pubkey, new LocalSigner(pubkey, { envelope }, { unlockCache }));
    updateMetadata(account as unknown as BrainstormAccount, { remembered: true, name: "Alice" });
    const manager = new AccountManager<AccountMetadata>();
    manager.addAccount(account as any);

    renderWith(manager);

    await waitFor(() => expect(screen.getByText("Alice:key:no-backup")).toBeInTheDocument());
    expect(account.locked).toBe(true);
  });

  it("judges an extension only once the wait is over", async () => {
    let answer = (_found: boolean) => {};
    extensionFound.mockReturnValue(new Promise<boolean>((resolve) => (answer = resolve)));
    const pubkey = getPublicKey(generateSecretKey());
    const account = new ExtensionAccount<AccountMetadata>(pubkey, new ExtensionSigner());
    updateMetadata(account as unknown as BrainstormAccount, { remembered: true, name: "Bob" });
    const manager = new AccountManager<AccountMetadata>();
    manager.addAccount(account as any);

    renderWith(manager);

    await waitFor(() => expect(screen.getByText("Bob:extension:checking")).toBeInTheDocument());

    answer(false);

    await waitFor(() =>
      expect(screen.getByText("Bob:extension:extension-missing")).toBeInTheDocument(),
    );
  });

  it("leaves out the accounts this device didn't keep", async () => {
    const pubkey = getPublicKey(generateSecretKey());
    const account = new ExtensionAccount<AccountMetadata>(pubkey, new ExtensionSigner());
    updateMetadata(account as unknown as BrainstormAccount, { remembered: false, name: "Carol" });
    const manager = new AccountManager<AccountMetadata>();
    manager.addAccount(account as any);

    renderWith(manager);

    await waitFor(() => expect(extensionFound).toHaveBeenCalled());
    expect(screen.queryByText(/Carol/)).not.toBeInTheDocument();
  });
});
