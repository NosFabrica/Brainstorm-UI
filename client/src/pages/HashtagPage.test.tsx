/** A hashtag page's Share pill and Copy link mint a `hashtag` short link. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { AccountManager } from "applesauce-accounts";
import { AccountsProvider, EventStoreProvider } from "applesauce-react/providers";
import { eventStore } from "@/lib/eventStore";
import type { AccountMetadata } from "@/accounts/metadata";

const createShortUrl = vi.fn();
vi.mock("@/services/api", () => ({ apiClient: { createShortUrl: (...a: unknown[]) => createShortUrl(...a) } }));
const copyMock = vi.fn(async (_text: string) => true);
const copyPromisedMock = vi.fn(async (_text: Promise<string>, _fallback: string) => true);
vi.mock("@/lib/clipboard", () => ({
  copyToClipboard: (text: string) => copyMock(text),
  copyPromisedText: (text: Promise<string>, fallback: string) => copyPromisedMock(text, fallback),
}));
vi.mock("@/hooks/useStoreEvents", () => ({
  useStoreEvents: () => ({ events: [], loading: false, settled: true }),
}));
vi.mock("@/hooks/useNoteRefs", () => ({
  useNoteRefs: () => ({ profiles: new Map(), eventsById: new Map(), addrByCoord: new Map() }),
}));

import HashtagPage from "./HashtagPage";

const ORIGIN = window.location.origin;
const SHORT = `${ORIGIN}/s/AB3XK9QZ`;
const LONG = `${ORIGIN}/t/mempoolmadness`;

function visit(path: string) {
  const { hook } = memoryLocation({ path });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <EventStoreProvider eventStore={eventStore}>
        <AccountsProvider manager={new AccountManager<AccountMetadata>()}>
          <Router hook={hook}>
            <Route path="/t/:tag" component={HashtagPage} />
          </Router>
        </AccountsProvider>
      </EventStoreProvider>
    </QueryClientProvider>,
  );
}

const openMenu = async () => {
  fireEvent.pointerDown(screen.getByTestId("hashtag-menu"), { button: 0, ctrlKey: false });
  return screen.findByRole("menu");
};

beforeEach(() => {
  createShortUrl.mockReset();
  createShortUrl.mockResolvedValue({
    shortCode: "AB3XK9QZ",
    kind: "hashtag",
    key: "mempoolmadness",
    relays: [],
    path: "/t/mempoolmadness",
  });
  copyMock.mockClear();
  copyPromisedMock.mockClear();
});

afterEach(() => {
  delete (navigator as { share?: unknown }).share;
});

describe("sharing a hashtag page", () => {
  it("Copy link copies the short link, minted for the word as the server keys it", async () => {
    visit("/t/MempoolMadness");
    fireEvent.click(within(await openMenu()).getByTestId("menu-copy-link"));
    await waitFor(() => expect(copyPromisedMock).toHaveBeenCalledTimes(1));
    const [text, fallback] = copyPromisedMock.mock.calls[0];
    expect(await text).toBe(SHORT);
    expect(fallback).toBe(LONG);
    expect(createShortUrl).toHaveBeenCalledWith({ kind: "hashtag", key: "mempoolmadness", relays: [] });
  });

  it("the Share pill hands the share sheet the short link", async () => {
    const shareMock = vi.fn(async (_d: { title: string; url: string }) => {});
    Object.defineProperty(navigator, "share", { value: shareMock, configurable: true, writable: true });
    visit("/t/mempoolmadness");
    const pill = screen.getByTestId("share-open-modal");
    fireEvent.pointerDown(pill);
    fireEvent.click(pill);
    await waitFor(() => expect(shareMock).toHaveBeenCalledWith({ title: "#mempoolmadness · Brainstorm", url: SHORT }));
  });

  it("without a share sheet, the plain sheet carries the short link", async () => {
    visit("/t/mempoolmadness");
    const pill = screen.getByTestId("share-open-modal");
    fireEvent.pointerDown(pill);
    fireEvent.click(pill);
    await waitFor(() => expect(screen.getByTestId("share-link-input")).toHaveValue(SHORT));
  });

  it("a short plain word shares its readable page, with no code minted", async () => {
    const shareMock = vi.fn(async (_d: { title: string; url: string }) => {});
    Object.defineProperty(navigator, "share", { value: shareMock, configurable: true, writable: true });
    visit("/t/bitcoin");
    const pill = screen.getByTestId("share-open-modal");
    fireEvent.pointerDown(pill);
    fireEvent.click(pill);
    await waitFor(() =>
      expect(shareMock).toHaveBeenCalledWith({ title: "#bitcoin · Brainstorm", url: `${ORIGIN}/t/bitcoin` }),
    );
    expect(createShortUrl).not.toHaveBeenCalled();
  });
});
