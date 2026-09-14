/**
 * One share sheet for every public page — note, article, hashtag — with the
 * profile's sheet composed on top of it (2026-09-08: Share looked and behaved
 * three different ways across pages). Link, copy, QR; the native sheet only
 * where the browser has one; slots for a preview and an extra row.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ShareModal } from "./ShareModal";

const copyMock = vi.fn(async (_text: string) => true);
vi.mock("@/lib/clipboard", () => ({ copyToClipboard: (text: string) => copyMock(text) }));

const URL = "https://brainstorm.world/e/nevent1abc";
const base = { open: true, onOpenChange: vi.fn(), url: URL, title: "Joe Martin on Brainstorm" };

beforeEach(() => copyMock.mockClear());
afterEach(() => {
  delete (navigator as { share?: unknown }).share;
});

describe("ShareModal", () => {
  it("by default: a page to share, its link, a QR — no native button, no Open link", () => {
    render(<ShareModal {...base} />);
    const modal = screen.getByTestId("modal-share");
    expect(modal).toHaveTextContent("Share this page");
    expect(screen.getByTestId("share-link-input")).toHaveValue(URL);
    expect(screen.getByTestId("share-qr")).toBeInTheDocument();
    expect(screen.queryByTestId("share-native")).toBeNull();
    expect(screen.queryByTestId("share-open-page-link")).toBeNull();
  });

  it("Copy copies the link and says so", async () => {
    render(<ShareModal {...base} />);
    fireEvent.click(screen.getByTestId("share-copy-link"));
    expect(copyMock).toHaveBeenCalledWith(URL);
    await waitFor(() => expect(screen.getByTestId("share-copy-link")).toHaveTextContent("Copied"));
  });

  it("a preview, an extra row, the Open link and custom words all render where asked", () => {
    render(
      <ShareModal
        {...base}
        kicker="Grow your network"
        heading="Invite to Brainstorm"
        description="Share your link."
        preview={<div data-testid="preview">card</div>}
        extra={<div data-testid="extra">nudge</div>}
        openLink
        testId="modal-share-profile"
      />,
    );
    const modal = screen.getByTestId("modal-share-profile");
    expect(modal).toHaveTextContent("Grow your network");
    expect(modal).toHaveTextContent("Invite to Brainstorm");
    expect(modal).toHaveTextContent("Share your link.");
    expect(screen.getByTestId("preview")).toBeInTheDocument();
    expect(screen.getByTestId("extra")).toBeInTheDocument();
    expect(screen.getByTestId("share-open-page-link")).toHaveAttribute("href", URL);
  });

  it("where the browser has a share sheet, the native button offers it with the title and link", async () => {
    const shareMock = vi.fn(async (_d: { title: string; url: string }) => {});
    Object.defineProperty(navigator, "share", { value: shareMock, configurable: true, writable: true });
    render(<ShareModal {...base} />);
    fireEvent.click(screen.getByTestId("share-native"));
    await waitFor(() => expect(shareMock).toHaveBeenCalledWith({ title: "Joe Martin on Brainstorm", url: URL }));
  });
});
