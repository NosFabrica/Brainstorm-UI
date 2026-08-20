import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

import { renderWithProviders } from "@/test/utils";
import type { AccountDisplay } from "@/accounts/display";
import type { BrainstormAccount } from "@/accounts/metadata";
import type { PickerIdentity } from "@/accounts/picker";
import { AccountMenuBody, useAccountMenu } from "./AccountMenuBody";

const removeAccountFromDevice = vi.fn(() => false);
const navigate = vi.fn();
/** The dialog turns on whether a copy of the key exists off this device. */
const losesKey = vi.fn(() => false);
const identities: PickerIdentity[] = [];

vi.mock("@/accounts/login-flow", () => ({
  removeAccountFromDevice: (account: BrainstormAccount) => removeAccountFromDevice(account),
}));
vi.mock("@/hooks/useLoginPicker", () => ({
  useLoginPicker: () => ({ identities, recheckExtension: () => {} }),
}));
vi.mock("applesauce-react/hooks", () => ({ useActiveAccount: () => ({ id: "alice-key" }) }));
vi.mock("@/accounts/picker", async (original) => ({
  ...(await original<typeof import("@/accounts/picker")>()),
  removalLosesKey: () => losesKey(),
}));
vi.mock("wouter", () => ({ useLocation: () => ["/dashboard", (to: string) => navigate(to)] }));
vi.mock("@/components/ShareProfileModal", () => ({ ShareProfileModal: () => null }));
vi.mock("@/components/ThemeToggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/services/api", () => ({ apiClient: { getHouseInfluence: async () => 0 } }));

const USER: AccountDisplay = {
  pubkey: "a".repeat(64),
  npub: "npub1alice8p3q",
  displayName: "Alice",
  isAdmin: false,
};

const account = { id: "bob-key", pubkey: "b".repeat(64) } as unknown as BrainstormAccount;

/** The panel as a host renders it: the body, plus the modals that live outside it. */
function Panel({ onLogout = () => {}, close = () => {} }: { onLogout?: () => void; close?: () => void }) {
  const menu = useAccountMenu(USER, onLogout, close);
  return (
    <>
      <AccountMenuBody
        user={USER}
        isAdmin={false}
        onNavigate={menu.onNavigate}
        onInvite={menu.onInvite}
        onRequestLogout={menu.onRequestLogout}
        onRequestRemove={menu.onRequestRemove}
        close={close}
      />
      {menu.modals}
      <button type="button" onClick={() => menu.onRequestRemove(account, true)} data-testid="ask-remove" />
      <button type="button" onClick={() => menu.onRequestRemove(account, false)} data-testid="ask-remove-other" />
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  losesKey.mockReturnValue(false);
  removeAccountFromDevice.mockReturnValue(false);
});

describe("the identity card", () => {
  it("is the way into the switcher, and swaps the panel rather than growing it", () => {
    renderWithProviders(<Panel />);

    fireEvent.click(screen.getByTestId("button-switch-account"));

    expect(screen.getByTestId("account-switcher")).toBeInTheDocument();
    // the panel's other face is gone, not pushed down
    expect(screen.queryByTestId("dropdown-logout")).not.toBeInTheDocument();
  });

  it("comes back", () => {
    renderWithProviders(<Panel />);

    fireEvent.click(screen.getByTestId("button-switch-account"));
    fireEvent.click(screen.getByTestId("switcher-back"));

    expect(screen.getByTestId("dropdown-logout")).toBeInTheDocument();
  });

  // The mocked picker lists nothing, which is what a device holds for an Account
  // signed in without "remember me".
  it("shows you in the switcher even where nothing keeps you", () => {
    renderWithProviders(<Panel />);

    fireEvent.click(screen.getByTestId("button-switch-account"));

    expect(screen.getByTestId("switcher-active-alice-key")).toBeInTheDocument();
  });

  it("still copies the npub, which is not what the card is now for", async () => {
    renderWithProviders(<Panel />);

    expect(screen.getByTestId("button-copy-npub")).toBeInTheDocument();
  });
});

describe("adding an account", () => {
  it("moved into the switcher, and says so to the page it lands on", () => {
    renderWithProviders(<Panel />);

    expect(screen.queryByTestId("dropdown-add-account")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("button-switch-account"));
    fireEvent.click(screen.getByTestId("switcher-add-account"));

    // and says where to put them back — adding an account is an errand
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining("/login?add=1"));
  });
});

describe("signing out", () => {
  // Decision 10: sign-out keeps the account and its key, so the wall that used to
  // stand here has nothing left to warn about.
  it("asks nothing and just goes", () => {
    const onLogout = vi.fn();
    renderWithProviders(<Panel onLogout={onLogout} />);

    fireEvent.click(screen.getByTestId("dropdown-logout"));

    expect(onLogout).toHaveBeenCalled();
    expect(screen.queryByTestId("remove-account-confirm")).not.toBeInTheDocument();
  });
});

describe("removing an account", () => {
  it("closes the panel and asks first", () => {
    const close = vi.fn();
    renderWithProviders(<Panel close={close} />);

    fireEvent.click(screen.getByTestId("ask-remove"));

    expect(close).toHaveBeenCalled();
    expect(removeAccountFromDevice).not.toHaveBeenCalled();
    expect(screen.getByTestId("remove-account-confirm")).toBeInTheDocument();
  });

  it("lets it go once confirmed", () => {
    renderWithProviders(<Panel />);

    fireEvent.click(screen.getByTestId("ask-remove"));
    fireEvent.click(screen.getByTestId("remove-account-confirm-button"));

    expect(removeAccountFromDevice).toHaveBeenCalledWith(account);
  });

  it("leaves a page belonging to the identity it just destroyed", () => {
    removeAccountFromDevice.mockReturnValue(true);
    renderWithProviders(<Panel />);

    fireEvent.click(screen.getByTestId("ask-remove"));
    fireEvent.click(screen.getByTestId("remove-account-confirm-button"));

    expect(navigate).toHaveBeenCalledWith("/");
  });

  // The wall decision 10 moved off sign-out: it stands where a key really dies.
  it("warns first where losing this browser is losing the account", () => {
    losesKey.mockReturnValue(true);
    renderWithProviders(<Panel />);

    fireEvent.click(screen.getByTestId("ask-remove"));

    expect(screen.getByTestId("remove-save-backup")).toBeInTheDocument();
    expect(removeAccountFromDevice).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("remove-save-backup"));

    expect(navigate).toHaveBeenCalledWith("/settings?tab=profile&focus=backup");
    expect(removeAccountFromDevice).not.toHaveBeenCalled();
  });

  // Settings' backup section acts on the Active Account, so offering it here for
  // somebody else would send the user off to back up the wrong key.
  it("does not offer to back up an account it cannot back up", () => {
    losesKey.mockReturnValue(true);
    renderWithProviders(<Panel />);

    fireEvent.click(screen.getByTestId("ask-remove-other"));

    expect(screen.getByTestId("remove-account-confirm")).toHaveTextContent(/can't be recovered/i);
    expect(screen.queryByTestId("remove-save-backup")).not.toBeInTheDocument();
  });

  it("takes the answer anyway, once it has been given", () => {
    losesKey.mockReturnValue(true);
    renderWithProviders(<Panel />);

    fireEvent.click(screen.getByTestId("ask-remove"));
    fireEvent.click(screen.getByTestId("remove-anyway"));

    expect(removeAccountFromDevice).toHaveBeenCalledWith(account);
  });
});
