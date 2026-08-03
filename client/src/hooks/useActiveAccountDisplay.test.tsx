import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { AccountManager, BaseAccount } from "applesauce-accounts";
import { AccountsProvider } from "applesauce-react/providers";
import { PrivateKeySigner } from "applesauce-signers";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";

import { rememberProfile } from "@/accounts/display";
import type { AccountMetadata, BrainstormAccount } from "@/accounts/metadata";
import { useActiveAccountDisplay } from "./useActiveAccountDisplay";

class TestAccount extends BaseAccount<PrivateKeySigner, never, AccountMetadata> {
  static readonly type = "test-identity-hook";
}

function account(metadata: Partial<AccountMetadata> = {}): BrainstormAccount {
  const key = generateSecretKey();
  const created = new TestAccount(getPublicKey(key), new PrivateKeySigner(key));
  created.metadata = { remembered: true, ...metadata };
  return created as unknown as BrainstormAccount;
}

function AccountDisplay() {
  const identity = useActiveAccountDisplay();
  if (!identity) return <p>signed out</p>;
  return (
    <p>
      {identity.displayName ?? "Anon"}
      {identity.isAdmin ? " (admin)" : ""}
    </p>
  );
}

function renderWith(manager: AccountManager<AccountMetadata>) {
  return render(
    <AccountsProvider manager={manager as any}>
      <AccountDisplay />
    </AccountsProvider>,
  );
}

describe("useActiveAccountDisplay", () => {
  it("has the identity on the very first render", () => {
    const manager = new AccountManager<AccountMetadata>();
    const a = account({ name: "Lira Flint" });
    manager.addAccount(a as any);
    manager.setActive(a as any);

    renderWith(manager);

    expect(screen.getByText("Lira Flint")).toBeInTheDocument();
  });

  it("shows the name and admin badge once they arrive after login", () => {
    const manager = new AccountManager<AccountMetadata>();
    const a = account();
    manager.addAccount(a as any);
    manager.setActive(a as any);
    renderWith(manager);
    expect(screen.getByText("Anon")).toBeInTheDocument();

    act(() => {
      rememberProfile(a, { name: "Lira Flint" });
      a.metadata = { ...a.metadata!, session: { token: "t", isAdmin: true } };
    });

    expect(screen.getByText("Lira Flint (admin)")).toBeInTheDocument();
  });

  it("clears when the account signs out", () => {
    const manager = new AccountManager<AccountMetadata>();
    const a = account({ name: "Lira Flint" });
    manager.addAccount(a as any);
    manager.setActive(a as any);
    renderWith(manager);

    act(() => manager.removeAccount(a as any));

    expect(screen.getByText("signed out")).toBeInTheDocument();
  });
});
