/**
 * One Share on every public page: the same pill, the same behaviour — the
 * browser's share sheet where it has one, the share modal where it does not.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  describe("with a short link to mint", () => {
    const SHORT = "https://brainstorm.world/s/AB3XK9QZ";
    const shareWith = (impl: (d: { title: string; url: string }) => Promise<void>) => {
      const shareMock = vi.fn(impl);
      Object.defineProperty(navigator, "share", { value: shareMock, configurable: true, writable: true });
      return shareMock;
    };
    const tap = () => {
      const button = screen.getByTestId("share-open-modal");
      fireEvent.pointerDown(button);
      fireEvent.click(button);
    };

    it("the share sheet gets the short link, minted from the press", async () => {
      const shareMock = shareWith(async () => {});
      const mint = vi.fn(async () => SHORT);
      render(<ShareButton url={URL} title="T" mint={mint} />);
      fireEvent.pointerDown(screen.getByTestId("share-open-modal"));
      expect(mint).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByTestId("share-open-modal"));
      await waitFor(() => expect(shareMock).toHaveBeenCalledWith({ title: "T", url: SHORT }));
      expect(mint).toHaveBeenCalledTimes(1);
    });

    it("a mint slower than the wait shares the long link instead", async () => {
      vi.useFakeTimers();
      try {
        const shareMock = shareWith(async () => {});
        render(<ShareButton url={URL} title="T" mint={() => new Promise<string>(() => {})} />);
        tap();
        await vi.advanceTimersByTimeAsync(1400);
        expect(shareMock).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(200);
        expect(shareMock).toHaveBeenCalledWith({ title: "T", url: URL });
      } finally {
        vi.useRealTimers();
      }
    });

    it("a failed mint shares the long link", async () => {
      const shareMock = shareWith(async () => {});
      render(<ShareButton url={URL} title="T" mint={async () => Promise.reject(new Error("429"))} />);
      tap();
      await waitFor(() => expect(shareMock).toHaveBeenCalledWith({ title: "T", url: URL }));
    });

    it("a share sheet refusing the late call (NotAllowedError) opens ours, carrying the short link", async () => {
      shareWith(async () => Promise.reject(new DOMException("Must be handling a user gesture", "NotAllowedError")));
      render(<ShareButton url={URL} title="T" mint={async () => SHORT} />);
      tap();
      expect(await screen.findByTestId("modal-share")).toBeInTheDocument();
      expect(screen.getByTestId("share-link-input")).toHaveValue(SHORT);
    });

    it("a richer sheet opens instead of the plain one on NotAllowedError", async () => {
      shareWith(async () => Promise.reject(new DOMException("", "NotAllowedError")));
      render(
        <ShareButton
          url={URL}
          title="T"
          mint={async () => SHORT}
          modal={({ open }) => (open ? <div data-testid="rich-sheet">rich</div> : null)}
        />,
      );
      tap();
      expect(await screen.findByTestId("rich-sheet")).toBeInTheDocument();
      expect(screen.queryByTestId("modal-share")).toBeNull();
    });

    it("cancelling the share sheet (AbortError) opens nothing", async () => {
      const shareMock = shareWith(async () => Promise.reject(new DOMException("Share canceled", "AbortError")));
      render(<ShareButton url={URL} title="T" mint={async () => SHORT} />);
      tap();
      await waitFor(() => expect(shareMock).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 0));
      expect(screen.queryByTestId("modal-share")).toBeNull();
    });

    it("a press with no click, then a page for another entity, shares that entity's link", async () => {
      const shareMock = shareWith(async () => {});
      const mintA = vi.fn(async () => "https://brainstorm.world/s/AAAAAAAA");
      const mintB = vi.fn(async () => SHORT);
      const { rerender } = render(<ShareButton url={URL} title="T" mint={mintA} />);
      fireEvent.pointerDown(screen.getByTestId("share-open-modal"));
      rerender(<ShareButton url={URL} title="T" mint={mintB} />);
      tap();
      await waitFor(() => expect(shareMock).toHaveBeenCalledWith({ title: "T", url: SHORT }));
    });

    it("a press with no click whose mint failed is retried on the next tap", async () => {
      const shareMock = shareWith(async () => {});
      const mint = vi.fn().mockRejectedValueOnce(new Error("429")).mockResolvedValue(SHORT);
      render(<ShareButton url={URL} title="T" mint={mint} />);
      fireEvent.pointerDown(screen.getByTestId("share-open-modal"));
      await new Promise((r) => setTimeout(r, 0));
      tap();
      await waitFor(() => expect(shareMock).toHaveBeenCalledWith({ title: "T", url: SHORT }));
      expect(mint).toHaveBeenCalledTimes(2);
    });

    it("without a share sheet, the modal opens at once and swaps in the short link", async () => {
      render(<ShareButton url={URL} title="T" mint={async () => SHORT} />);
      tap();
      expect(screen.getByTestId("modal-share")).toBeInTheDocument();
      await waitFor(() => expect(screen.getByTestId("share-link-input")).toHaveValue(SHORT));
    });
  });
});
