import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import { renderWithProviders } from "@/test/utils";
import { CreateAccountModal } from "./CreateAccountModal";

const createAccount = vi.fn(async () => ({ pubkey: "a".repeat(64), displayName: "Lira" }));

vi.mock("@/accounts/login-flow", () => ({
  createAccount: (...args: unknown[]) => createAccount(...(args as [])),
}));
vi.mock("@/services/trustAnchor", () => ({ triggerScoringAndAnchor: vi.fn() }));
vi.mock("@/services/socialActions", () => ({ followPubkeys: vi.fn() }));
vi.mock("@/hooks/usePasskeySupport", () => ({
  usePasskeySupport: () => ({ support: { supported: true }, method: { label: "Face ID", withPhrase: "Face ID" } }),
}));

function open() {
  renderWithProviders(<CreateAccountModal open onOpenChange={() => {}} onCreated={vi.fn()} />);
  fireEvent.change(screen.getByTestId("input-create-display-name"), { target: { value: "Lira" } });
}

beforeEach(() => vi.clearAllMocks());

describe("creating an account where the browser can make a passkey", () => {
  it("leads with the passkey and asks for no password", async () => {
    open();

    expect(screen.queryByTestId("input-create-password")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("button-create-passkey"));

    await waitFor(() =>
      expect(createAccount).toHaveBeenCalledWith("Lira", { inviterPubkey: undefined, passkey: true }),
    );
    expect(await screen.findByTestId("text-create-passkey-done")).toHaveTextContent("Protected with Face ID");
  });

  it("goes back to the form, saying nothing, when the system sheet is closed", async () => {
    createAccount.mockRejectedValueOnce(Object.assign(new Error("cancelled"), { name: "NotAllowedError" }));
    open();

    fireEvent.click(screen.getByTestId("button-create-passkey"));

    await waitFor(() => expect(screen.getByTestId("button-create-passkey")).toBeEnabled());
    expect(screen.queryByTestId("status-create-error")).not.toBeInTheDocument();
  });

  it("keeps the recovery password one tap away", () => {
    open();

    fireEvent.click(screen.getByTestId("button-create-use-password"));

    expect(screen.getByTestId("input-create-password")).toBeInTheDocument();
    expect(screen.queryByTestId("button-create-passkey")).not.toBeInTheDocument();
  });
});
