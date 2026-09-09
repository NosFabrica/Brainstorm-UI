/**
 * The profile's ⋯ menu, now for everyone: copies of the keys and "Open in"
 * for any visitor; Mute and Report lead it for a signed-in viewer on someone
 * else's page; the admin's Advanced view stays last. Before, a signed-out
 * visitor had no menu at all (team feedback, 2026-09-08).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { nip19 } from "nostr-tools";
import { ProfileMenu } from "./ProfileMenu";

const copyMock = vi.fn(async (_text: string) => true);
vi.mock("@/lib/clipboard", () => ({ copyToClipboard: (text: string) => copyMock(text) }));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
const muteUser = vi.fn(async (_pk: string) => ({ success: true }));
const unmuteUser = vi.fn(async (_pk: string) => ({ success: true }));
const reportUser = vi.fn(async (_pk: string, _reason: string) => ({ success: true }));
vi.mock("@/services/socialActions", () => ({
  muteUser: (pk: string) => muteUser(pk),
  unmuteUser: (pk: string) => unmuteUser(pk),
  reportUser: (pk: string, reason: string) => reportUser(pk, reason),
}));

const PK = "a".repeat(64);
const npub = nip19.npubEncode(PK);
const RELAYS = ["wss://one.example", "wss://two.example"];
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124.0 Safari/537.36";

function menuFor(viewer: { loggedIn: boolean; isOwner: boolean; isAdmin: boolean }, extra: Partial<{ initialMuted: boolean; alreadyReported: boolean }> = {}) {
  render(<ProfileMenu pubkey={PK} npub={npub} relays={RELAYS} viewer={viewer} initialMuted={extra.initialMuted ?? false} alreadyReported={extra.alreadyReported ?? false} ua={MAC} />);
}
const open = async () => {
  fireEvent.pointerDown(screen.getByTestId("share-actions-menu"), { button: 0, ctrlKey: false });
  return screen.findByRole("menu");
};

beforeEach(() => {
  copyMock.mockClear();
  toast.mockClear();
  muteUser.mockClear();
  muteUser.mockResolvedValue({ success: true });
});

describe("ProfileMenu", () => {
  it("signed out: the copies and Open in, and nothing to mute, report or administer", async () => {
    menuFor({ loggedIn: false, isOwner: false, isAdmin: false });
    const menu = await open();
    expect(within(menu).getByTestId("menu-copy-npub")).toBeInTheDocument();
    expect(within(menu).getByTestId("menu-copy-hex")).toBeInTheDocument();
    expect(within(menu).getByTestId("menu-copy-nprofile")).toBeInTheDocument();
    expect(within(menu).getByTestId("open-primal")).toBeInTheDocument();
    expect(within(menu).queryByTestId("share-mute")).toBeNull();
    expect(within(menu).queryByTestId("share-report")).toBeNull();
    expect(within(menu).queryByTestId("share-advanced-view")).toBeNull();
  });

  it("signed in on someone else's page, Mute and Report lead the menu", async () => {
    menuFor({ loggedIn: true, isOwner: false, isAdmin: false });
    const menu = await open();
    const mute = within(menu).getByTestId("share-mute");
    expect(within(menu).getByTestId("share-report")).toBeInTheDocument();
    expect(mute.compareDocumentPosition(within(menu).getByTestId("menu-copy-npub")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the owner gets the copies and Open in, nothing to mute", async () => {
    menuFor({ loggedIn: true, isOwner: true, isAdmin: false });
    const menu = await open();
    expect(within(menu).getByTestId("menu-copy-npub")).toBeInTheDocument();
    expect(within(menu).queryByTestId("share-mute")).toBeNull();
    expect(within(menu).queryByTestId("share-report")).toBeNull();
  });

  it("an admin gets Advanced view last, into the deep-dive", async () => {
    menuFor({ loggedIn: true, isOwner: false, isAdmin: true });
    const menu = await open();
    const advanced = within(menu).getByTestId("share-advanced-view");
    expect(advanced).toHaveAttribute("href", `/profile/${npub}`);
    expect(within(menu).getByTestId("open-primal").compareDocumentPosition(advanced) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("Mute publishes and flips to Unmute; a refusal reverts with a toast", async () => {
    menuFor({ loggedIn: true, isOwner: false, isAdmin: false });
    let menu = await open();
    fireEvent.click(within(menu).getByTestId("share-mute"));
    await waitFor(() => expect(muteUser).toHaveBeenCalledWith(PK));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Muted" })));
    menu = await open();
    expect(within(menu).getByTestId("share-mute")).toHaveTextContent("Unmute");
    unmuteUser.mockResolvedValueOnce({ success: false, error: "relay refused" } as { success: boolean });
    fireEvent.click(within(menu).getByTestId("share-mute"));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    menu = await open();
    expect(within(menu).getByTestId("share-mute")).toHaveTextContent("Unmute");
  });

  it("Copy nprofile carries the person's relays; Copy public key copies the raw hex", async () => {
    menuFor({ loggedIn: false, isOwner: false, isAdmin: false });
    const menu = await open();
    fireEvent.click(within(menu).getByTestId("menu-copy-nprofile"));
    await waitFor(() => expect(copyMock).toHaveBeenCalled());
    const decoded = nip19.decode(copyMock.mock.calls[0][0]);
    expect(decoded.type).toBe("nprofile");
    expect(decoded.data).toMatchObject({ pubkey: PK, relays: RELAYS });
    fireEvent.click(within(menu).getByTestId("menu-copy-hex"));
    await waitFor(() => expect(copyMock).toHaveBeenLastCalledWith(PK));
  });

  it("the three copy rows say what each key is for", async () => {
    menuFor({ loggedIn: false, isOwner: false, isAdmin: false });
    const menu = await open();
    expect(within(menu).getByTestId("menu-copy-npub-hint")).toHaveTextContent("Their public key, for Nostr apps and mentions");
    expect(within(menu).getByTestId("menu-copy-hex-hint")).toHaveTextContent("The raw key, for developers and relay tools");
    expect(within(menu).getByTestId("menu-copy-nprofile-hint")).toHaveTextContent("Their key plus the relays their posts live on");
  });
});
