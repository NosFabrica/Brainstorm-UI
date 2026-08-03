import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import { renderWithProviders } from "@/test/utils";
import { CreateAccountModal } from "./CreateAccountModal";

const PUBKEY = "a".repeat(64);
const PASSWORD = "hunter2hunter2";

const createAccount = vi.fn(async () => ({ pubkey: PUBKEY, displayName: "Lira" }));
const triggerScoringAndAnchor = vi.fn(async () => {});
const followPubkeys = vi.fn(async () => ({ success: true }));
const onCreated = vi.fn();

vi.mock("@/services/nostr", () => ({
  createAccount: (...args: unknown[]) => createAccount(...(args as [])),
  triggerScoringAndAnchor: (...args: unknown[]) => triggerScoringAndAnchor(...(args as [])),
}));
vi.mock("@/services/socialActions", () => ({
  followPubkeys: (...args: unknown[]) => followPubkeys(...(args as [])),
}));

function open() {
  renderWithProviders(
    <CreateAccountModal open onOpenChange={() => {}} onCreated={onCreated} />,
  );
}

/** Fill the whole form in, ready to submit. */
function fillIn({ password = PASSWORD, confirm = PASSWORD } = {}) {
  open();
  fireEvent.change(screen.getByTestId("input-create-display-name"), { target: { value: "Lira" } });
  fireEvent.change(screen.getByTestId("input-create-password"), { target: { value: password } });
  fireEvent.change(screen.getByTestId("input-create-confirm"), { target: { value: confirm } });
  return screen.getByTestId("button-create-submit");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("choosing a Recovery password at signup", () => {
  it("mints the account under the password the user typed", async () => {
    fireEvent.click(fillIn());

    await waitFor(() =>
      expect(createAccount).toHaveBeenCalledWith("Lira", expect.objectContaining({ password: PASSWORD })),
    );
  });

  it("won't submit a name with no password", () => {
    open();
    fireEvent.change(screen.getByTestId("input-create-display-name"), { target: { value: "Lira" } });

    expect(screen.getByTestId("button-create-submit")).toBeDisabled();
  });

  it("won't submit a password under eight characters", () => {
    expect(fillIn({ password: "short7!", confirm: "short7!" })).toBeDisabled();
  });

  // The defence that matters: weakness is cheap here, a typo is unrecoverable.
  it("won't submit a confirm that doesn't match, and says so", () => {
    const submit = fillIn({ confirm: "hunter2hunter3" });

    expect(submit).toBeDisabled();
    expect(screen.getByTestId("text-create-mismatch")).toBeInTheDocument();
  });

  it("has no strength meter to argue with", () => {
    fillIn({ password: "password", confirm: "password" });

    expect(screen.getByTestId("button-create-submit")).toBeEnabled();
    expect(screen.queryByTestId("create-password-strength")).not.toBeInTheDocument();
  });
});

describe("letting a password manager capture it", () => {
  it("submits a real form, with stable names and new-password autocomplete on both fields", () => {
    fillIn();

    const password = screen.getByTestId("input-create-password");
    const confirm = screen.getByTestId("input-create-confirm");
    expect(password.closest("form")).not.toBeNull();
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "new-password");
    expect(confirm).toHaveAttribute("autocomplete", "new-password");
    expect(password).toHaveAttribute("name", "recovery-password");
    expect(confirm).toHaveAttribute("name", "recovery-password-confirm");
    // Outside Chromium the form markup is the only capture there is, and a
    // password with no username field beside it is the case browsers skip.
    expect(screen.getByTestId("input-create-display-name")).toHaveAttribute(
      "autocomplete",
      "username",
    );
  });

  it("submits on enter, not only on the button", async () => {
    fillIn();

    fireEvent.submit(screen.getByTestId("input-create-password").closest("form")!);

    await waitFor(() => expect(createAccount).toHaveBeenCalledTimes(1));
  });
});

describe("the copy", () => {
  it("no longer sells passwordlessness, and doesn't claim the key stays here", () => {
    open();

    const subtitle = screen.getByTestId("text-create-subtitle").textContent ?? "";
    expect(subtitle).not.toMatch(/no password/i);
    expect(document.body.textContent).not.toMatch(/never leaves/i);
  });

  it("says there is no reset", () => {
    open();

    expect(screen.getByTestId("text-create-password-hint").textContent).toMatch(/no reset/i);
  });
});

describe("minting blocks the main thread", () => {
  it("paints the setting-up state before the derivation starts", async () => {
    fireEvent.click(fillIn());

    expect(screen.getByTestId("button-create-submit").textContent).toMatch(/setting up/i);
    expect(createAccount).not.toHaveBeenCalled(); // the paint hasn't happened yet

    await waitFor(() => expect(createAccount).toHaveBeenCalledTimes(1));
  });

  it("takes one submission, however many times an impatient user clicks", async () => {
    const submit = fillIn();

    fireEvent.click(submit);
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(createAccount).toHaveBeenCalledTimes(1));
  });
});
