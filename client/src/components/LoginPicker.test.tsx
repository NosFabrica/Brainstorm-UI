import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import { renderWithProviders } from "@/test/utils";
import type { BrainstormAccount } from "@/accounts/metadata";
import type { PickerIdentity, RowHealth, SignerKind } from "@/accounts/picker";
import { LoginPicker } from "./LoginPicker";

const signInWithAccount = vi.fn();
const removeAccountFromDevice = vi.fn();
const toast = vi.fn();

vi.mock("@/services/nostr", () => ({
  signInWithAccount: (account: BrainstormAccount) => signInWithAccount(account),
  removeAccountFromDevice: (account: BrainstormAccount) => removeAccountFromDevice(account),
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
    selectable: health !== "key-unavailable" && health !== "extension-missing",
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

function renderPicker(identities: PickerIdentity[], props: Record<string, unknown> = {}) {
  return renderWithProviders(
    <LoginPicker
      identities={identities}
      onSignedIn={() => {}}
      onUseKey={() => {}}
      onRecheckExtension={() => {}}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  signInWithAccount.mockResolvedValue({});
});

describe("the accounts this device kept", () => {
  it("offers each one, named, before anything has authenticated", () => {
    renderPicker([identity()]);

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("npub1alice8p3q")).toBeInTheDocument();
  });

  it("signs in as the one that was picked, and hands over", async () => {
    const onSignedIn = vi.fn();
    renderPicker([identity()], { onSignedIn });

    fireEvent.click(screen.getByTestId("button-pick-account-alice-key"));

    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
    expect(signInWithAccount).toHaveBeenCalledWith(expect.objectContaining({ id: "alice-key" }));
  });

  it("says nothing when the user declines to unlock — that was deliberate", async () => {
    const cancelled = new Error("Unlock cancelled");
    cancelled.name = "UnlockCancelled";
    signInWithAccount.mockRejectedValue(cancelled);
    renderPicker([identity()]);

    fireEvent.click(screen.getByTestId("button-pick-account-alice-key"));

    await waitFor(() => expect(signInWithAccount).toHaveBeenCalled());
    expect(toast).not.toHaveBeenCalled();
  });

  it("reports a sign-in that failed for any other reason", async () => {
    signInWithAccount.mockRejectedValue(new Error("server unreachable"));
    renderPicker([identity()]);

    fireEvent.click(screen.getByTestId("button-pick-account-alice-key"));

    await waitFor(() => expect(toast).toHaveBeenCalled());
  });

  it("has something to say on a device holding nothing", () => {
    renderPicker([]);

    expect(screen.getByTestId("login-picker-empty")).toBeInTheDocument();
  });
});

describe("an identity holding more than one signer", () => {
  it("appears once, with a row per signer", () => {
    renderPicker([
      identity({ rows: [row("alice-key", "key"), row("alice-ext", "extension")] }),
    ]);

    expect(screen.getAllByText("Alice")).toHaveLength(1);
    expect(screen.getByTestId("button-pick-account-alice-key")).toBeInTheDocument();
    expect(screen.getByTestId("button-pick-account-alice-ext")).toBeInTheDocument();
  });

  it("names the signer on every row, which is what tells them apart", () => {
    renderPicker([
      identity({ rows: [row("alice-key", "key"), row("alice-ext", "extension")] }),
    ]);

    expect(screen.getByText("Key")).toBeInTheDocument();
    expect(screen.getByText("Extension")).toBeInTheDocument();
  });
});

describe("a row whose health is still unknown", () => {
  it("keeps quiet rather than guessing", () => {
    renderPicker([identity({ rows: [row("alice-ext", "extension", "checking")] })]);

    expect(screen.queryByTestId("chip-health-alice-ext")).not.toBeInTheDocument();
    expect(screen.getByTestId("button-pick-account-alice-ext")).toBeInTheDocument();
  });
});

describe("a key that can't be recovered here", () => {
  const dead = () =>
    identity({ name: "Dave", rows: [row("dave-key", "key", "key-unavailable")] });

  it("keeps its place and its npub, but is not a way in", () => {
    renderPicker([dead()]);

    expect(screen.getByText("Dave")).toBeInTheDocument();
    expect(screen.getByText("npub1alice8p3q")).toBeInTheDocument();
    expect(screen.queryByTestId("button-pick-account-dave-key")).not.toBeInTheDocument();
  });

  it("offers the key they may still hold elsewhere", () => {
    const onUseKey = vi.fn();
    renderPicker([dead()], { onUseKey });

    fireEvent.click(screen.getByTestId("button-use-key-dave-key"));

    expect(onUseKey).toHaveBeenCalled();
  });

  it("asks before letting the last trace of it go", async () => {
    renderPicker([dead()]);

    fireEvent.click(screen.getByTestId("button-forget-account-dave-key"));
    expect(removeAccountFromDevice).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByTestId("button-forget-account-confirm"));

    expect(removeAccountFromDevice).toHaveBeenCalledWith(expect.objectContaining({ id: "dave-key" }));
  });

  it("explains a browser-wide loss once, not once per account", () => {
    renderPicker([
      identity({ name: "Dave", rows: [row("dave-key", "key", "key-unavailable")] }),
      identity({
        pubkey: "b".repeat(64),
        npub: "npub1erin9w6r",
        name: "Erin",
        rows: [row("erin-key", "key", "key-unavailable")],
      }),
    ]);

    expect(screen.getByTestId("notice-keys-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("text-key-unavailable-dave-key")).not.toBeInTheDocument();
  });
});

describe("an extension that isn't here", () => {
  it("is marked, and can be looked for again", () => {
    const onRecheckExtension = vi.fn();
    renderPicker(
      [identity({ rows: [row("alice-ext", "extension", "extension-missing")] })],
      { onRecheckExtension },
    );

    expect(screen.queryByTestId("button-pick-account-alice-ext")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("button-recheck-extension-alice-ext"));

    expect(onRecheckExtension).toHaveBeenCalled();
  });
});
