import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

import { renderWithProviders } from "@/test/utils";
import type { BrainstormAccount } from "@/accounts/metadata";
import { AccountCards } from "./AccountCards";

const deferredAccount = vi.fn<() => BrainstormAccount | null>();

vi.mock("@/hooks/useDeferredSession", () => ({ useDeferredSession: () => deferredAccount() }));
vi.mock("@/services/api", () => ({ resumeSession: vi.fn() }));
vi.mock("./PostSignupCard", () => ({ PostSignupCard: () => <div data-testid="card-post-signup" /> }));
vi.mock("./BackupReminder", () => ({ BackupReminder: () => <div data-testid="backup-reminder" /> }));

const account = { id: "acc-1", pubkey: "a".repeat(64) } as unknown as BrainstormAccount;

beforeEach(() => {
  vi.clearAllMocks();
  deferredAccount.mockReturnValue(null);
});

describe("the account card strip", () => {
  // Stubbed here, so both render: the real pair arbitrates between themselves —
  // the reminder waits for the post-signup card to be dismissed.
  it("leaves the backup chain to itself when nothing is blocking data", () => {
    renderWithProviders(<AccountCards />);

    expect(screen.getByTestId("card-post-signup")).toBeInTheDocument();
    expect(screen.getByTestId("backup-reminder")).toBeInTheDocument();
    expect(screen.queryByTestId("card-unlock-session")).not.toBeInTheDocument();
  });

  it("gives the strip to the unlock card — it is blocking data right now", () => {
    deferredAccount.mockReturnValue(account);

    renderWithProviders(<AccountCards />);

    expect(screen.getByTestId("card-unlock-session")).toBeInTheDocument();
    expect(screen.queryByTestId("card-post-signup")).not.toBeInTheDocument();
    expect(screen.queryByTestId("backup-reminder")).not.toBeInTheDocument();
  });

  it("hands the strip back to the next nudge once the unlock card is dismissed", () => {
    deferredAccount.mockReturnValue(account);

    renderWithProviders(<AccountCards />);
    fireEvent.click(screen.getByTestId("button-unlock-session-dismiss"));

    expect(screen.queryByTestId("card-unlock-session")).not.toBeInTheDocument();
    expect(screen.getByTestId("card-post-signup")).toBeInTheDocument();
  });
});
