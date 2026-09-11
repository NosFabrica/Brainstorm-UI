import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { UserActionsMenu } from "./UserActionsMenu";

const PK = "a".repeat(64);

describe("UserActionsMenu", () => {
  it("folds the row actions into one menu; trigger and view fire their handlers", async () => {
    const onTrigger = vi.fn();
    const onView = vi.fn();
    renderWithProviders(
      <UserActionsMenu pubkey={PK} onTrigger={onTrigger} onView={onView} testIdSuffix="0" />,
    );

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
    renderWithProviders(
      <UserActionsMenu pubkey={PK} onTrigger={() => {}} onView={() => {}} testIdSuffix="0" />,
    );

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
});
