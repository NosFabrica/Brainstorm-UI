import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import { renderWithProviders } from "@/test/utils";
import { SignOutEverywhereRow } from "./SignOutEverywhereRow";

const revokeOwnSessions = vi.fn(async () => {});
vi.mock("@/services/api", () => ({ apiClient: { revokeOwnSessions: () => revokeOwnSessions() } }));

describe("signing out everywhere", () => {
  it("asks first, then revokes every session and signs this device out", async () => {
    const onSignedOut = vi.fn();
    renderWithProviders(<SignOutEverywhereRow onSignedOut={onSignedOut} />);

    fireEvent.click(screen.getByTestId("button-account-logout-everywhere"));
    expect(revokeOwnSessions).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("logout-everywhere-confirm-button"));

    await waitFor(() => expect(onSignedOut).toHaveBeenCalled());
    expect(revokeOwnSessions).toHaveBeenCalledTimes(1);
  });

  it("keeps this device signed in, and says why, when the server refused", async () => {
    revokeOwnSessions.mockRejectedValueOnce(new Error("nope"));
    const onSignedOut = vi.fn();
    renderWithProviders(<SignOutEverywhereRow onSignedOut={onSignedOut} />);

    fireEvent.click(screen.getByTestId("button-account-logout-everywhere"));
    fireEvent.click(screen.getByTestId("logout-everywhere-confirm-button"));

    expect(await screen.findByText("nope")).toBeInTheDocument();
    expect(onSignedOut).not.toHaveBeenCalled();
  });
});
