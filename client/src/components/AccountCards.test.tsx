import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

import { renderWithProviders } from "@/test/utils";
import type { BrainstormAccount } from "@/accounts/metadata";
import { AccountCards } from "./AccountCards";

const deferredAccount = vi.fn<() => BrainstormAccount | null>();
const activeAccount = vi.fn<() => { id: string } | null>();

vi.mock("@/hooks/useDeferredSession", () => ({ useDeferredSession: () => deferredAccount() }));
vi.mock("applesauce-react/hooks", () => ({ useActiveAccount: () => activeAccount() }));
vi.mock("@/services/api", () => ({ resumeSession: vi.fn() }));
vi.mock("./PostSignupCard", () => ({ PostSignupCard: () => <div data-testid="card-post-signup" /> }));
vi.mock("./BackupReminder", () => ({ BackupReminder: () => <div data-testid="backup-reminder" /> }));

const account = { id: "acc-1", pubkey: "a".repeat(64) } as unknown as BrainstormAccount;

beforeEach(() => {
  vi.clearAllMocks();
  deferredAccount.mockReturnValue(null);
  activeAccount.mockReturnValue({ id: "acc-1" });
});

/**
 * Switching accounts in-app does not unmount anything, so every piece of state
 * in this strip — a dismissal, a snooze, a delivered backup — describes whoever
 * was active when it was set, and keeps describing them afterwards. The strip is
 * keyed on the Account so the whole subtree starts again.
 */
describe("switching accounts under the strip", () => {
  /** Re-renders without remounting — which is what an in-app switch does. */
  function Host() {
    const [, bump] = useState(0);
    return (
      <>
        <button data-testid="bump" onClick={() => bump((n) => n + 1)} />
        <AccountCards />
      </>
    );
  }

  it("offers the next account its own unlock card", () => {
    deferredAccount.mockReturnValue(account);
    renderWithProviders(<Host />);
    fireEvent.click(screen.getByTestId("button-unlock-session-dismiss"));
    expect(screen.queryByTestId("card-unlock-session")).not.toBeInTheDocument();

    // B's session is deferred too, and B has dismissed nothing
    activeAccount.mockReturnValue({ id: "acc-2" });
    fireEvent.click(screen.getByTestId("bump"));

    expect(screen.getByTestId("card-unlock-session")).toBeInTheDocument();
  });

  it("keeps a dismissal for the account that made it", () => {
    deferredAccount.mockReturnValue(account);
    renderWithProviders(<Host />);
    fireEvent.click(screen.getByTestId("button-unlock-session-dismiss"));

    fireEvent.click(screen.getByTestId("bump"));

    expect(screen.queryByTestId("card-unlock-session")).not.toBeInTheDocument();
  });
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

  // PLAN §10 fixes the priority as unlock → backup → post-signup. The lower two
  // also gate each other, but that is a second mechanism, not this one.
  it("puts the backup nag above the post-signup card, in priority order", () => {
    renderWithProviders(<AccountCards />);

    const strip = screen.getByTestId("backup-reminder").parentElement!;
    const order = [...strip.children].map((child) => child.getAttribute("data-testid"));

    expect(order.indexOf("backup-reminder")).toBeLessThan(order.indexOf("card-post-signup"));
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
