// @vitest-environment jsdom
/**
 * The inbox list says what a reader needs and no more: chats as soon as any
 * server has answered, one quiet line for servers that are slow or silent
 * (not a mono row per relay), and Requests explained in a sentence.
 */
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { DmEngine, DmEngineState } from "@/services/dm/engine";
import type { RelayProgress } from "@/lib/dm/pager";
import type { DmRoom } from "@/lib/dm/store";

vi.mock("@/hooks/useMyFollows", () => ({ useMyFollows: () => ({ follows: new Set(), ready: true, signedIn: true }) }));
vi.mock("./usePeopleSearch", () => ({ usePeopleSearch: () => ({ people: [], searching: false }) }));
vi.mock("@/hooks/useRelayAuthProblems", () => ({ useRelayAuthProblems: () => new Map() }));
vi.mock("./RequestTrust", () => ({ RequestTrustLine: () => null }));

import { ConversationList } from "./ConversationList";
import { readDmPrefs } from "@/lib/dm/prefs";
import { notLoadedRoom } from "@/lib/dm/inbox";

const ME = "f".repeat(64);
const relay = (url: string, state: RelayProgress["state"], pages = 1): RelayProgress => ({
  url,
  state,
  reachedUntil: 0,
  completeTo: state === "done" ? 0 : 1_700_000_000,
  pages,
});
const stateWith = (relays: RelayProgress[], liveSettled = true): DmEngineState =>
  ({
    status: "ready",
    inboxRelays: relays.map((r) => r.url),
    live: {},
    liveSynced: liveSettled,
    liveSettled,
    sendAuth: [],
    floor: 0,
    queued: 0,
    failed: 0,
    setAside: 0,
    downloading: false,
    sync: { received: {}, opened: 0 },
    history: {
      floor: 0,
      relays,
      loading: relays.some((r) => r.state === "loading"),
      exhausted: false,
      complete: false,
    },
  }) as DmEngineState;
const room = (c: string): DmRoom => ({
  key: [ME, c.repeat(64)].sort().join(","),
  participants: [ME, c.repeat(64)].sort(),
  messages: [],
  reactions: new Map(),
  lastAt: 1_700_000_000,
  hasMine: false,
});
const shelves = (over: Partial<{ chats: DmRoom[]; pinnedCount: number; requests: DmRoom[]; low: DmRoom[] }> = {}) => ({
  chats: [],
  pinnedCount: 0,
  archived: [],
  requests: [],
  low: [],
  flagged: [],
  badge: 0,
  scoreOf: () => 0.1,
  ...over,
});

function show(
  state: DmEngineState,
  tab: "chats" | "requests" = "chats",
  s = shelves(),
  engine: Partial<DmEngine> = {},
) {
  render(
    <Router hook={memoryLocation({ path: "/messages" }).hook}>
      <ConversationList
        engine={engine as DmEngine}
        state={state}
        shelves={s}
        prefs={readDmPrefs(ME)}
        profiles={new Map()}
        me={ME}
        selectedKey={null}
        tab={tab}
      />
    </Router>,
  );
}

describe("ConversationList", () => {
  it("says it's loading only until a server has answered", () => {
    show(stateWith([relay("wss://a.example", "loading", 0)], false));
    expect(screen.getByText("Loading your messages…")).toBeInTheDocument();
  });

  it("one server having delivered its history is an answer, even while another never replies", () => {
    // What a real inbox did: primal done, damus silent, so the live subscription never "settled".
    show(stateWith([relay("wss://relay.primal.net", "done"), relay("wss://relay.damus.io", "stalled", 0)], false));
    expect(screen.getByText("No chats yet.")).toBeInTheDocument();
  });

  it("an empty inbox reads as empty once a server has answered, however long the rest take", () => {
    show(stateWith([relay("wss://a.example", "done"), relay("wss://b.example", "loading")]));
    expect(screen.getByText("No chats yet.")).toBeInTheDocument();
    expect(screen.queryByText("Loading your messages…")).toBeNull();
  });

  it("a silent server is one plain line: what it means, Retry, and Manage", () => {
    const retry = vi.fn();
    show(
      stateWith([
        relay("wss://relay.damus.io", "stalled"),
        relay("wss://nos.lol", "loading"),
        relay("wss://relay.primal.net", "done"),
      ]),
      "chats",
      shelves(),
      { retry, advance: vi.fn() },
    );
    const line = screen.getByTestId("dm-history-status");
    expect(line).toHaveTextContent(
      "1 of your 3 message servers isn't answering. Your messages still arrive through the others.",
    );
    expect(screen.queryByText(/relay\.damus\.io/)).toBeNull();
    expect(screen.getByRole("link", { name: "Manage" })).toHaveAttribute("href", "/settings?tab=messages");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledWith("wss://relay.damus.io");
  });

  it("after a Retry, a server still silent is a quiet line for the rest of the visit", () => {
    show(stateWith([relay("wss://relay.damus.io", "stalled"), relay("wss://nos.lol", "done")]), "chats", shelves(), {
      retry: vi.fn(),
      advance: vi.fn(),
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    const line = screen.getByTestId("dm-history-status");
    expect(line).toHaveTextContent("1 server isn't answering");
    expect(line).not.toHaveTextContent("still arrive");
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.getByRole("link", { name: "Manage" })).toBeInTheDocument();
  });

  it("a server still connecting well after another answered is counted as not answering, as Settings counts it", () => {
    vi.useFakeTimers();
    const st = stateWith([relay("wss://relay.primal.net", "done"), relay("wss://relay.damus.io", "idle", 0)]);
    st.live = { "wss://relay.primal.net": "synced", "wss://relay.damus.io": "connecting" };
    show(st);
    expect(screen.queryByTestId("dm-history-status")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(16_000);
    });
    expect(screen.getByTestId("dm-history-status")).toHaveTextContent("1 of your 2 message servers isn't answering.");
    vi.useRealTimers();
  });

  it("when no server answers, says plainly that new messages can't reach you", () => {
    show(stateWith([relay("wss://relay.damus.io", "stalled"), relay("wss://nos.lol", "stalled")]), "chats", shelves(), {
      retry: vi.fn(),
      advance: vi.fn(),
    });
    expect(screen.getByTestId("dm-history-status")).toHaveTextContent(
      "None of your message servers are answering. New messages can't reach you right now.",
    );
    expect(screen.getByRole("link", { name: "Manage" })).toBeInTheDocument();
  });

  it("lists a pinned chat whose messages aren't loaded, saying so instead of a preview and a date", () => {
    const pin = notLoadedRoom([ME, "b".repeat(64)].sort().join(","))!;
    show(stateWith([relay("wss://a.example", "idle")]), "chats", shelves({ chats: [pin], pinnedCount: 1 }));
    const row = screen.getByTestId("dm-room-row");
    expect(row).toHaveTextContent("Older messages aren't loaded yet");
    expect(row).not.toHaveTextContent("1970");
    expect(screen.queryByText("No chats yet.")).toBeNull();
  });

  it("before any server answers, a not-loaded pin says it's loading and the inbox still says so too", () => {
    const pin = notLoadedRoom([ME, "b".repeat(64)].sort().join(","))!;
    show(
      stateWith([relay("wss://a.example", "loading", 0)], false),
      "chats",
      shelves({ chats: [pin], pinnedCount: 1 }),
    );
    expect(screen.getByTestId("dm-room-not-loaded")).toHaveTextContent("Loading…");
    expect(screen.getByText("Loading your messages…")).toBeInTheDocument();
  });

  it("while fetched or cached wraps are still being opened, a not-loaded pin says it's loading", () => {
    const pin = notLoadedRoom([ME, "b".repeat(64)].sort().join(","))!;
    show(
      stateWith([{ ...relay("wss://a.example", "idle"), opening: 40 }]),
      "chats",
      shelves({ chats: [pin], pinnedCount: 1 }),
    );
    expect(screen.getByTestId("dm-room-not-loaded")).toHaveTextContent("Loading…");
  });

  it("explains Requests in a sentence, and names the low-trust group plainly", () => {
    show(
      stateWith([relay("wss://a.example", "done")]),
      "requests",
      shelves({ requests: [room("a")], low: [room("b"), room("c")] }),
    );
    expect(screen.getByTestId("dm-requests-explainer")).toHaveTextContent(
      "From people you don't follow, sorted by who your network trusts.",
    );
    expect(screen.getByTestId("dm-low-trust-toggle")).toHaveTextContent("Low trust · 2 (previews hidden)");
  });
});
