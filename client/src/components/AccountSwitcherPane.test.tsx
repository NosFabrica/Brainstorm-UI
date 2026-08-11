import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import { renderWithProviders } from "@/test/utils";
import type { BrainstormAccount } from "@/accounts/metadata";
import type { PickerIdentity, RowHealth, SignerKind } from "@/accounts/picker";
import { AccountSwitcherPane } from "./AccountSwitcherPane";

const signInWithAccount = vi.fn();
const toast = vi.fn();

vi.mock("@/services/nostr", () => ({
  signInWithAccount: (account: BrainstormAccount) => signInWithAccount(account),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

function account(id: string): BrainstormAccount {
  return { id, pubkey: id.repeat(8) } as unknown as BrainstormAccount;
}

function row(id: string, signer: SignerKind = "key", health: RowHealth = "ok") {
  return {
    account: account(id),
    signer,
    health,
    selectable: health === "ok" || health === "no-backup" || health === "checking",
  };
}

function identity(overrides: Partial<PickerIdentity> = {}): PickerIdentity {
  return {
    pubkey: "a".repeat(64),
    npub: "npub1alice8p3q",
    name: "Alice",
    rows: [row("alice-key")],
    ...overrides,
  };
}

const bob = () =>
  identity({ pubkey: "b".repeat(64), npub: "npub1bob4t7z", name: "Bob", rows: [row("bob-key")] });

function renderPane(identities: PickerIdentity[], props: Record<string, unknown> = {}) {
  return renderWithProviders(
    <AccountSwitcherPane
      identities={identities}
      activeId="alice-key"
      onBack={() => {}}
      onSwitched={() => {}}
      onRequestRemove={() => {}}
      onAddAccount={() => {}}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  signInWithAccount.mockResolvedValue({});
});

describe("the accounts this device holds", () => {
  it("names every one of them, the active account included", () => {
    renderPane([identity(), bob()]);

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("marks the one that signs, and does not offer it as a way to switch", () => {
    renderPane([identity(), bob()]);

    expect(screen.getByTestId("switcher-active-alice-key")).toBeInTheDocument();
    expect(screen.queryByTestId("switcher-pick-alice-key")).not.toBeInTheDocument();
    expect(screen.getByTestId("switcher-pick-bob-key")).toBeInTheDocument();
  });

  it("says which signer stands behind a row", () => {
    renderPane([identity({ rows: [row("alice-key", "key"), row("alice-ext", "extension")] })]);

    expect(screen.getByText("Key")).toBeInTheDocument();
    expect(screen.getByText("Extension")).toBeInTheDocument();
  });

  // The only place this is ever said about an Account that isn't the active one:
  // BackupReminder nags about that one alone.
  it("says when a second account has no backup behind it", () => {
    renderPane([identity(), { ...bob(), rows: [row("bob-key", "key", "no-backup")] }]);

    expect(screen.getByTestId("chip-health-bob-key")).toHaveTextContent("No backup");
  });

  it("keeps a signer that can't sign here listed, without offering it", () => {
    renderPane([identity(), { ...bob(), rows: [row("bob-ext", "extension", "extension-missing")] }]);

    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.queryByTestId("switcher-pick-bob-ext")).not.toBeInTheDocument();
  });

  // A pane swap keeps the panel's other face out of the way; the cap is what keeps
  // a device holding ten identities from stretching it anyway.
  it("scrolls the list rather than growing the panel", () => {
    const { container } = renderPane([identity(), bob()]);

    expect(container.querySelector(".overflow-y-auto")).toBeTruthy();
  });
});

describe("switching", () => {
  it("signs in as the account that was picked, and closes the panel", async () => {
    const onSwitched = vi.fn();
    renderPane([identity(), bob()], { onSwitched });

    fireEvent.click(screen.getByTestId("switcher-pick-bob-key"));

    await waitFor(() => expect(onSwitched).toHaveBeenCalled());
    expect(signInWithAccount).toHaveBeenCalledWith(expect.objectContaining({ id: "bob-key" }));
  });

  it("says nothing when the user declines to unlock — that was deliberate", async () => {
    const cancelled = new Error("Unlock cancelled");
    cancelled.name = "UnlockCancelled";
    signInWithAccount.mockRejectedValue(cancelled);
    const onSwitched = vi.fn();
    renderPane([identity(), bob()], { onSwitched });

    fireEvent.click(screen.getByTestId("switcher-pick-bob-key"));

    await waitFor(() => expect(signInWithAccount).toHaveBeenCalled());
    expect(toast).not.toHaveBeenCalled();
    expect(onSwitched).not.toHaveBeenCalled();
  });

  it("reports a switch that failed for any other reason", async () => {
    signInWithAccount.mockRejectedValue(new Error("server unreachable"));
    renderPane([identity(), bob()]);

    fireEvent.click(screen.getByTestId("switcher-pick-bob-key"));

    await waitFor(() => expect(toast).toHaveBeenCalled());
  });
});

describe("removing an account", () => {
  it("is not on offer until Manage is on", () => {
    renderPane([identity(), bob()]);

    expect(screen.queryByTestId("switcher-remove-bob-key")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("switcher-manage"));

    expect(screen.getByTestId("switcher-remove-bob-key")).toBeInTheDocument();
  });

  // A key-destroying control may not share a row with the thing the pane exists
  // for, so the rows stop being tap targets while Manage is on.
  it("takes the rows out of service while it is", () => {
    renderPane([identity(), bob()]);

    fireEvent.click(screen.getByTestId("switcher-manage"));

    expect(screen.queryByTestId("switcher-pick-bob-key")).not.toBeInTheDocument();
  });

  it("hands the account to the host rather than destroying it here", () => {
    const onRequestRemove = vi.fn();
    renderPane([identity(), bob()], { onRequestRemove });

    fireEvent.click(screen.getByTestId("switcher-manage"));
    fireEvent.click(screen.getByTestId("switcher-remove-bob-key"));

    // and says it wasn't the active row — the host's "save a backup first" offer
    // only works for the Account that is signing
    expect(onRequestRemove).toHaveBeenCalledWith(expect.objectContaining({ id: "bob-key" }), false);
  });

  // That account may be Locked, and unlocking it to throw it away is absurd.
  it("works on an account nobody is signed in as, without switching to it first", () => {
    const onRequestRemove = vi.fn();
    renderPane([identity(), bob()], { onRequestRemove });

    fireEvent.click(screen.getByTestId("switcher-manage"));
    fireEvent.click(screen.getByTestId("switcher-remove-bob-key"));

    expect(signInWithAccount).not.toHaveBeenCalled();
    expect(onRequestRemove).toHaveBeenCalled();
  });
});

describe("the way out", () => {
  it("goes back to the panel it came from", () => {
    const onBack = vi.fn();
    renderPane([identity()], { onBack });

    fireEvent.click(screen.getByTestId("switcher-back"));

    expect(onBack).toHaveBeenCalled();
  });

  it("offers adding an account this device doesn't hold", () => {
    const onAddAccount = vi.fn();
    renderPane([identity()], { onAddAccount });

    fireEvent.click(screen.getByTestId("switcher-add-account"));

    expect(onAddAccount).toHaveBeenCalled();
  });
});
