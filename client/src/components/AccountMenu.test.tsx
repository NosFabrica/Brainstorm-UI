// @vitest-environment jsdom
/**
 * The account menu's contents are their own chunk: the trigger is there at
 * once, the body arrives on demand, and a row in the body still reaches the
 * logic and modals that live outside the popover (useAccountMenu).
 */
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/AccountMenuBody", () => ({
  AccountMenuBody: ({ onInvite }: { onInvite: () => void }) => (
    <button type="button" data-testid="fake-invite" onClick={onInvite}>
      Invite
    </button>
  ),
  useAccountMenu: (_user: unknown, _onLogout: () => void, close: () => void) => {
    const [inviting, setInviting] = useState(false);
    return {
      onNavigate: vi.fn(),
      onInvite: () => {
        close();
        setInviting(true);
      },
      onRequestLogout: vi.fn(),
      onRequestRemove: vi.fn(),
      modals: inviting ? <div data-testid="fake-invite-modal" /> : null,
    };
  },
}));

import { AccountMenu } from "./AccountMenu";

const user = { pubkey: "a".repeat(64), npub: "npub1x", displayName: "Ada", isAdmin: false } as never;

describe("AccountMenu", () => {
  it("opens on the body once it arrives, and its rows reach the modals outside the popover", async () => {
    render(<AccountMenu user={user} onLogout={vi.fn()} />);
    fireEvent.click(screen.getByTestId("button-user-menu"));
    fireEvent.click(await screen.findByTestId("fake-invite"));
    expect(await screen.findByTestId("fake-invite-modal")).toBeInTheDocument();
    expect(screen.queryByTestId("menu-user")).toBeNull();
  });
});
