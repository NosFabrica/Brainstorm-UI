/**
 * The profile's share sheet, pinned before it is rebuilt on the generic
 * ShareModal (2026-09-08): the invite framing, the OG card, the photo nudge
 * and "Open the page" must survive the refactor unchanged.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ShareProfileModal } from "./ShareProfileModal";

const copyMock = vi.fn(async (_text: string) => true);
vi.mock("@/lib/clipboard", () => ({ copyToClipboard: (text: string) => copyMock(text) }));
const navigate = vi.fn();
vi.mock("wouter", () => ({ useLocation: () => ["/", navigate] }));
vi.mock("@/components/ShareOgCard", () => ({ ShareOgCard: ({ displayName }: { displayName: string }) => <div data-testid="og-card">{displayName}</div> }));

const URL = "https://brainstorm.world/p/npub1joe";
const base = { open: true, onOpenChange: vi.fn(), npub: "npub1joe", displayName: "Joe Martin", canonicalUrl: URL };

beforeEach(() => {
  copyMock.mockClear();
  navigate.mockClear();
});

describe("ShareProfileModal", () => {
  it("shares a profile: the OG card, the link, and a way to open the page", () => {
    render(<ShareProfileModal {...base} picture="https://img/joe.jpg" />);
    const modal = screen.getByTestId("modal-share-profile");
    expect(modal).toHaveTextContent("Verification Score");
    expect(modal).toHaveTextContent("Share this profile");
    expect(screen.getByTestId("share-open-page-card")).toHaveAttribute("href", URL);
    expect(screen.getByTestId("og-card")).toHaveTextContent("Joe Martin");
    expect(screen.getByTestId("share-link-input")).toHaveValue(URL);
    expect(screen.getByTestId("share-open-page-link")).toHaveAttribute("href", URL);
    expect(screen.getByTestId("share-qr")).toBeInTheDocument();
  });

  it("opened from the page itself, it does not offer to open the page", () => {
    render(<ShareProfileModal {...base} onOwnPage />);
    expect(screen.queryByTestId("share-open-page-link")).toBeNull();
  });

  it("inviting without a photo nudges toward adding one, which closes the sheet and goes to settings", () => {
    const onOpenChange = vi.fn();
    render(<ShareProfileModal {...base} onOpenChange={onOpenChange} invite />);
    expect(screen.getByTestId("modal-share-profile")).toHaveTextContent("Invite to Brainstorm");
    fireEvent.click(screen.getByTestId("share-add-photo-nudge"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(navigate).toHaveBeenCalledWith("/settings?tab=profile");
  });

  it("inviting with a photo has no nudge", () => {
    render(<ShareProfileModal {...base} invite picture="https://img/joe.jpg" />);
    expect(screen.queryByTestId("share-add-photo-nudge")).toBeNull();
  });
});
