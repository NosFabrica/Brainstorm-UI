// @vitest-environment jsdom
/**
 * "From your network" is the reader's own feed, and it reads as endless: rows
 * reveal as they scroll, the module asks the store for an older week when the
 * loaded notes run out, and after a few automatic turns a button takes over so
 * the page has a floor.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { renderWithProviders } from "@/test/utils";
import { stubControllableIntersectionObserver } from "@/test/controllableIntersectionObserver";

const ME = "f".repeat(64);
const AUTHORS = Array.from({ length: 30 }, (_, i) => i.toString(16).padStart(64, "0"));
const DAY = 24 * 60 * 60;
const NOW = Math.floor(Date.now() / 1000);

// Sixty notes from thirty authors, two each, spread over the last six days.
const note = (i: number) => ({
  id: `n${i}`.padEnd(64, "0"),
  kind: 1,
  pubkey: AUTHORS[i % AUTHORS.length],
  created_at: NOW - i * 2 * 60 * 60,
  content: `note ${i}`,
  tags: [] as string[][],
  sig: "",
});
const NOTES = Array.from({ length: 60 }, (_, i) => note(i));

// What the module asks the store for, call by call: the key and the filters.
const asked = vi.fn();
vi.mock("@/hooks/useStoreEvents", () => ({
  useStoreEvents: (key: string | null, filters: unknown[] | null) => {
    if (key) asked(key, filters);
    if (!key || !key.startsWith("thread-notes:")) return { events: [], loading: false, settled: true };
    return { events: NOTES, loading: false, settled: true };
  },
}));
vi.mock("@/hooks/useStoreReplaceable", () => ({
  useStoreReplaceable: () => ({
    event: { kind: 3, pubkey: ME, tags: AUTHORS.map((p) => ["p", p]), content: "", created_at: NOW, id: "c", sig: "" },
    loading: false,
  }),
}));
vi.mock("@/hooks/useLiveProfile", () => ({ useLiveProfiles: () => new Map() }));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => undefined }));
vi.mock("@/services/nostr", () => ({
  fetchEventsByFilter: vi.fn(async () => []),
  fetchEventsByIds: vi.fn(async () => []),
}));
vi.mock("@/lib/connection", () => ({ useConnectionSpeed: () => "normal" }));
vi.mock("@/components/share/ShareNoteCard", () => ({
  ShareNoteCard: ({ event }: { event: { content: string } }) => <div>{event.content}</div>,
}));
vi.mock("@/components/share/ShareNavContext", () => ({
  ShareNavProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { NetworkThreadModule } from "./NetworkThreadModule";

function show() {
  renderWithProviders(
    <Router hook={memoryLocation({ path: "/dashboard" }).hook}>
      <NetworkThreadModule observer={ME} enabled />
    </Router>,
  );
}

const rows = () => within(screen.getByTestId("network-thread-list")).getAllByTestId("network-thread-note");
const lastAskedSince = () => {
  const notesAsks = asked.mock.calls.filter(([k]) => String(k).startsWith("thread-notes:"));
  const [, filters] = notesAsks[notesAsks.length - 1];
  return (filters as { since: number }[])[0].since;
};

beforeEach(() => {
  asked.mockClear();
});

describe("NetworkThreadModule as an endless feed", () => {
  it("reveals twenty rows at a time as the reader reaches the bottom, then asks for the week before", async () => {
    const io = stubControllableIntersectionObserver();
    show();
    await screen.findByTestId("network-thread-list");
    expect(rows()).toHaveLength(20);
    const firstSince = lastAskedSince();

    io.bringAllIntoView();
    expect(rows()).toHaveLength(40);
    io.bringAllIntoView();
    expect(rows()).toHaveLength(60);
    // Everything loaded is on screen: the next turn asks the store for the previous seven days.
    expect(lastAskedSince()).toBe(firstSince);
    io.bringAllIntoView();
    expect(lastAskedSince()).toBe(firstSince - 7 * DAY);
  });

  it("after five automatic turns the sentinel stops and a button takes over, so the page has a floor", async () => {
    const io = stubControllableIntersectionObserver();
    show();
    await screen.findByTestId("network-thread-list");
    for (let i = 0; i < 5; i++) io.bringAllIntoView();
    const observedBefore = io.observers.reduce((n, o) => n + o.observed.size, 0);
    expect(observedBefore).toBe(0);
    const more = screen.getByTestId("network-thread-more");
    expect(more).toHaveTextContent("More from your network");
    const since = lastAskedSince();
    fireEvent.click(more);
    expect(lastAskedSince()).toBe(since - 7 * DAY);
  });
});
