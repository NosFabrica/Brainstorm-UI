import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { apiClient } from "@/services/api";
import { UserActionsMenu } from "./UserActionsMenu";

// The Dictionary's concepts come from relays (hooks/useDictionaryConcepts): none here, already known.
vi.mock("@/hooks/useDictionaryConcepts", () => ({
  useDictionaryConcepts: () => ({ shown: [], rendered: [], known: true }),
}));

const PK = "a".repeat(64);

afterEach(() => vi.restoreAllMocks());

describe("UserActionsMenu", () => {
  it("folds the row actions into one menu; trigger and view fire their handlers", async () => {
    const onTrigger = vi.fn();
    const onView = vi.fn();
    renderWithProviders(<UserActionsMenu pubkey={PK} onTrigger={onTrigger} onView={onView} testIdSuffix="0" />);

    await userEvent.click(screen.getByTestId("user-actions-0"));
    await userEvent.click(await screen.findByTestId("user-action-trigger"));
    expect(onTrigger).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByTestId("user-actions-0"));
    await userEvent.click(await screen.findByTestId("user-action-view"));
    expect(onView).toHaveBeenCalledTimes(1);
  });

  // The dialog lives outside the menu, so selecting the item (which closes
  // and unmounts the menu) must still leave a working confirm on screen.
  it("resync opens its confirm dialog after the menu closes", async () => {
    renderWithProviders(<UserActionsMenu pubkey={PK} onTrigger={() => {}} onView={() => {}} testIdSuffix="0" />);

    await userEvent.click(screen.getByTestId("user-actions-0"));
    await userEvent.click(await screen.findByTestId("user-action-resync"));

    expect(await screen.findByText("Resync published state")).toBeInTheDocument();
  });

  it("disables triggering while a run is in flight", async () => {
    const onTrigger = vi.fn();
    renderWithProviders(
      <UserActionsMenu pubkey={PK} triggering onTrigger={onTrigger} onView={() => {}} testIdSuffix="0" />,
    );

    await userEvent.click(screen.getByTestId("user-actions-0"));
    const item = await screen.findByTestId("user-action-trigger");
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(item.textContent).toContain("Triggering…");
  });

  // Trusted Lists are published for one observer at a time; from a user's row,
  // that observer is them.
  it("sends this user to Trusted Lists", async () => {
    const onPublishTrustedLists = vi.fn();
    renderWithProviders(
      <UserActionsMenu
        pubkey={PK}
        onTrigger={() => {}}
        onView={() => {}}
        onPublishTrustedLists={onPublishTrustedLists}
        testIdSuffix="0"
      />,
    );

    await userEvent.click(screen.getByTestId("user-actions-0"));
    await userEvent.click(await screen.findByTestId("user-action-trusted-lists"));

    expect(onPublishTrustedLists).toHaveBeenCalledTimes(1);
  });

  it("revokes this user's sessions once confirmed", async () => {
    const spy = vi.spyOn(apiClient, "revokeUserSessions").mockResolvedValue(undefined);
    renderWithProviders(<UserActionsMenu pubkey={PK} onTrigger={() => {}} onView={() => {}} testIdSuffix="0" />);

    await userEvent.click(screen.getByTestId("user-actions-0"));
    await userEvent.click(await screen.findByTestId("user-action-revoke-sessions"));
    expect(spy).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole("button", { name: /confirm revoke/i }));

    await waitFor(() => expect(spy).toHaveBeenCalledWith(PK));
  });

  it("shows why a revoke failed and keeps the dialog open", async () => {
    vi.spyOn(apiClient, "revokeUserSessions").mockRejectedValue(new Error("Unknown user"));
    renderWithProviders(<UserActionsMenu pubkey={PK} onTrigger={() => {}} onView={() => {}} testIdSuffix="0" />);

    await userEvent.click(screen.getByTestId("user-actions-0"));
    await userEvent.click(await screen.findByTestId("user-action-revoke-sessions"));
    await userEvent.click(await screen.findByRole("button", { name: /confirm revoke/i }));

    expect(await screen.findByText("Unknown user")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm revoke/i })).toBeInTheDocument();
  });
});
