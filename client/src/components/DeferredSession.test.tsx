import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import { renderWithProviders } from "@/test/utils";
import type { BrainstormAccount } from "@/accounts/metadata";
import { DeferredSessionCard, DeferredSessionNotice } from "./DeferredSession";

const resumeSession = vi.fn();
const toast = vi.fn();
const deferredAccount = vi.fn<() => BrainstormAccount | null>();

vi.mock("@/services/api", () => ({ resumeSession: () => resumeSession() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/hooks/useDeferredSession", () => ({ useDeferredSession: () => deferredAccount() }));

const account = { id: "acc-1", pubkey: "a".repeat(64) } as unknown as BrainstormAccount;

beforeEach(() => {
  vi.clearAllMocks();
  resumeSession.mockResolvedValue(true);
  deferredAccount.mockReturnValue(account);
});

describe("the unlock card", () => {
  it("stays away while the session is healthy", () => {
    deferredAccount.mockReturnValue(null);

    renderWithProviders(<DeferredSessionCard onDismiss={() => {}} />);

    expect(screen.queryByTestId("card-unlock-session")).not.toBeInTheDocument();
  });

  it("offers to unlock when the account is locked with no session", () => {
    renderWithProviders(<DeferredSessionCard onDismiss={() => {}} />);

    expect(screen.getByTestId("card-unlock-session")).toBeInTheDocument();
  });

  it("ensures the session, which triggers the unlock the user just opted into", async () => {
    renderWithProviders(<DeferredSessionCard onDismiss={() => {}} />);

    fireEvent.click(screen.getByTestId("button-unlock-session"));

    await waitFor(() => expect(resumeSession).toHaveBeenCalled());
  });

  it("can be dismissed — reading on is a fair choice", () => {
    const onDismiss = vi.fn();
    renderWithProviders(<DeferredSessionCard onDismiss={onDismiss} />);

    fireEvent.click(screen.getByTestId("button-unlock-session-dismiss"));

    expect(onDismiss).toHaveBeenCalled();
  });

  it("says nothing when the user declines the password — that was deliberate", async () => {
    const cancelled = new Error("Unlock cancelled");
    cancelled.name = "UnlockCancelled";
    resumeSession.mockRejectedValue(cancelled);
    renderWithProviders(<DeferredSessionCard onDismiss={() => {}} />);

    fireEvent.click(screen.getByTestId("button-unlock-session"));

    await waitFor(() => expect(resumeSession).toHaveBeenCalled());
    expect(toast).not.toHaveBeenCalled();
    expect(screen.getByTestId("card-unlock-session")).toBeInTheDocument();
  });

  it("reports a failure that isn't a deliberate no", async () => {
    resumeSession.mockRejectedValue(new Error("server unreachable"));
    renderWithProviders(<DeferredSessionCard onDismiss={() => {}} />);

    fireEvent.click(screen.getByTestId("button-unlock-session"));

    await waitFor(() => expect(toast).toHaveBeenCalled());
  });
});

describe("the shared sign-in-again state", () => {
  it("gates itself, so a page can drop it in and never ask the question", () => {
    deferredAccount.mockReturnValue(null);

    renderWithProviders(<DeferredSessionNotice />);

    expect(screen.queryByTestId("notice-unlock-session")).not.toBeInTheDocument();
  });

  it("ends in the same place as the card", async () => {
    renderWithProviders(<DeferredSessionNotice />);

    fireEvent.click(screen.getByTestId("button-unlock-session"));

    await waitFor(() => expect(resumeSession).toHaveBeenCalled());
  });

  it("reloads the surfaces that failed, once the session is back", async () => {
    const { queryClient } = renderWithProviders(<DeferredSessionNotice />);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    fireEvent.click(screen.getByTestId("button-unlock-session"));

    await waitFor(() => expect(invalidate).toHaveBeenCalled());
  });
});
