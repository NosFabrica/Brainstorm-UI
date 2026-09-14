/**
 * One Share on every public page: the same pill, the same behaviour — the
 * browser's share sheet where it has one, the share modal where it does not.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ShareButton } from "./ShareButton";

vi.mock("@/lib/clipboard", () => ({ copyToClipboard: async () => true }));

const URL = "https://brainstorm.world/a/naddr1abc";

afterEach(() => {
  delete (navigator as { share?: unknown }).share;
});

describe("ShareButton", () => {
  it("without a share sheet, Share opens the modal carrying the link", () => {
    render(<ShareButton url={URL} title="Bitcoin Is The New Rock & Roll — Brainstorm" />);
    const button = screen.getByTestId("share-open-modal");
    expect(button).toHaveTextContent("Share");
    expect(screen.queryByTestId("modal-share")).toBeNull();
    fireEvent.click(button);
    expect(screen.getByTestId("modal-share")).toBeInTheDocument();
    expect(screen.getByTestId("share-link-input")).toHaveValue(URL);
  });

  it("with a share sheet, Share hands the title and link to it and opens nothing", () => {
    const shareMock = vi.fn(async (_d: { title: string; url: string }) => {});
    Object.defineProperty(navigator, "share", { value: shareMock, configurable: true, writable: true });
    render(<ShareButton url={URL} title="Bitcoin Is The New Rock & Roll — Brainstorm" />);
    fireEvent.click(screen.getByTestId("share-open-modal"));
    expect(shareMock).toHaveBeenCalledWith({ title: "Bitcoin Is The New Rock & Roll — Brainstorm", url: URL });
    expect(screen.queryByTestId("modal-share")).toBeNull();
  });

  it("a page with a richer sheet passes it in, and the plain modal stays away", () => {
    const seen: boolean[] = [];
    render(
      <ShareButton
        url={URL}
        title="Joe Martin on Brainstorm"
        modal={({ open }) => {
          seen.push(open);
          return open ? <div data-testid="rich-sheet">rich</div> : null;
        }}
      />,
    );
    expect(seen).toEqual([false]);
    fireEvent.click(screen.getByTestId("share-open-modal"));
    expect(screen.getByTestId("rich-sheet")).toBeInTheDocument();
    expect(screen.queryByTestId("modal-share")).toBeNull();
  });
});
