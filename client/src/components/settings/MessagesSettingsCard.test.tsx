// @vitest-environment jsdom
/**
 * Settings › Messages, where the inbox's "Manage" lands: each message server
 * says whether it's working, and one that isn't answering can be swapped for a
 * suggested server in a click — published only when the reader says so.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import type { DmEngineState } from "@/services/dm/engine";
import { eventStore } from "@/lib/eventStore";
import type { ReplaceableProbe } from "@/lib/replaceableDraft";

const ME = "a".repeat(64);
const RELAYS = ["wss://relay.damus.io/", "wss://relay.primal.net/", "wss://auth.nostr1.com/"];
const LIST = {
  id: "1".repeat(64),
  kind: 10050,
  pubkey: ME,
  created_at: 100,
  content: "",
  sig: "s",
  tags: RELAYS.map((r) => ["relay", r]),
} as NostrEvent;
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ pubkey: "a".repeat(64) }) }));
// How the kind 10050 is read: answered with the list, unless a test holds the answer back.
const probe = vi.hoisted(() => ({ answer: null as null | (() => Promise<ReplaceableProbe>) }));
vi.mock("@/lib/replaceableDraft", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/replaceableDraft")>()),
  probeReplaceable: () => probe.answer!(),
}));
vi.mock("@/components/settings/FileServersSection", () => ({ FileServersSection: () => null }));
vi.mock("@/components/messages/SyncDetails", () => ({ SyncDetails: () => null }));
const publishInboxRelays = vi.fn(async (_relays: string[], _opts?: unknown) => ({ success: true }));
vi.mock("@/services/dm", () => ({
  publishInboxRelays: (r: string[], opts?: unknown) => publishInboxRelays(r, opts),
}));

const realVerify = eventStore.verifyEvent;
beforeAll(() => {
  eventStore.verifyEvent = undefined;
  eventStore.add(LIST);
});
afterAll(() => {
  eventStore.verifyEvent = realVerify;
});
beforeEach(() => {
  publishInboxRelays.mockClear();
  probe.answer = async () => ({ event: LIST, provenAbsent: false });
});

let state = {
  status: "ready",
  live: { "wss://relay.primal.net/": "synced" },
  history: {
    relays: [
      { url: "wss://relay.damus.io/", state: "stalled", reachedUntil: 0, completeTo: 0, pages: 0 },
      { url: "wss://relay.primal.net/", state: "done", reachedUntil: 0, completeTo: 0, pages: 2 },
      { url: "wss://auth.nostr1.com/", state: "auth", reachedUntil: 0, completeTo: 0, pages: 0 },
    ],
  },
} as unknown as DmEngineState;
const allSilent = {
  status: "ready",
  live: {},
  history: {
    relays: [
      { url: "wss://relay.damus.io/", state: "stalled", reachedUntil: 0, completeTo: 0, pages: 0 },
      { url: "wss://relay.primal.net/", state: "stalled", reachedUntil: 0, completeTo: 0, pages: 0 },
      { url: "wss://auth.nostr1.com/", state: "stalled", reachedUntil: 0, completeTo: 0, pages: 0 },
    ],
  },
} as unknown as DmEngineState;
const someWorking = state;
vi.mock("@/hooks/useDirectMessages", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useDmEngine: () => null,
  useDmState: () => state,
}));

import { MessagesSettingsCard } from "./MessagesSettingsCard";

const row = (host: string) => screen.getByTestId(`dm-server-${host}`);

describe("MessagesSettingsCard servers", () => {
  it("says, in plain words, which servers are working", async () => {
    render(<MessagesSettingsCard />);
    expect(screen.getByText("Message servers")).toBeInTheDocument();
    await screen.findByTestId("dm-server-relay.damus.io");
    expect(row("relay.damus.io")).toHaveTextContent("Not answering");
    expect(row("relay.primal.net")).toHaveTextContent("Working");
    expect(row("auth.nostr1.com")).toHaveTextContent("Asks you to sign in");
  });

  it("while any server works, offers no swap — only the reassurance that messages still arrive", async () => {
    state = someWorking;
    render(<MessagesSettingsCard />);
    await screen.findByTestId("dm-server-relay.damus.io");
    expect(within(row("relay.damus.io")).queryByRole("button", { name: /Replace/ })).toBeNull();
    expect(screen.getByTestId("dm-servers-note")).toHaveTextContent(
      "Messages still reach you through your other servers.",
    );
    expect(screen.queryByRole("button", { name: "Use suggested servers" })).toBeNull();
  });

  it("when none answer, offers the suggested servers — explained, and published only once confirmed", async () => {
    state = allSilent;
    render(<MessagesSettingsCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Use suggested servers" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("New messages will go to auth.nostr1.com and nos.lol");
    expect(dialog).toHaveTextContent("Messages on your current servers won't load until you add them back");
    expect(publishInboxRelays).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Switch and publish" }));
    await waitFor(() =>
      expect(publishInboxRelays).toHaveBeenCalledWith(["wss://auth.nostr1.com/", "wss://nos.lol/"], {
        createdAt: expect.any(Number),
      }),
    );
    state = someWorking;
  });

  /**
   * "Add" used to work while the list was still loading: the draft started
   * from nothing, and Publish replaced the real list with the one relay typed.
   */
  it("adds nothing before the list is read, and adds to the list once it is", async () => {
    let answer: ((p: ReplaceableProbe) => void) | undefined;
    probe.answer = () => new Promise((r) => (answer = r));
    render(<MessagesSettingsCard />);
    await waitFor(() => expect(answer).toBeDefined());
    const input = screen.getByLabelText("Relay address");
    fireEvent.change(input, { target: { value: "wss://mine.example" } });
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    fireEvent.submit(input.closest("form")!);
    expect(screen.queryByText("Unsaved changes")).toBeNull();

    probe.answer = async () => ({ event: LIST, provenAbsent: false });
    await act(async () => answer!({ event: LIST, provenAbsent: false }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByTestId("button-publish-inbox-relays"));
    await waitFor(() => expect(publishInboxRelays).toHaveBeenCalled());
    expect(publishInboxRelays.mock.calls[0][0]).toEqual([...RELAYS, "wss://mine.example/"]);
  });

  it("says when the list couldn't be read, and offers no edit on it", async () => {
    probe.answer = async () => ({ event: undefined, provenAbsent: false });
    eventStore.remove(LIST);
    try {
      render(<MessagesSettingsCard />);
      expect(await screen.findByTestId("list-draft-notice-unreadable")).toBeInTheDocument();
      expect(screen.queryByText(/None yet/)).toBeNull();
      expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    } finally {
      eventStore.add(LIST);
    }
  });
});

describe("MessagesSettingsCard notifications", () => {
  /** A browser tab, a desktop's installed app, or a phone's. */
  const as = (where: "tab" | "desktop app" | "phone app") =>
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches:
        (q === "(display-mode: standalone)" && where !== "tab") || (q === "(pointer: coarse)" && where === "phone app"),
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  afterEach(() => vi.unstubAllGlobals());

  it("in a tab, speaks of the browser and the tab", () => {
    as("tab");
    render(<MessagesSettingsCard />);
    expect(screen.getByText("Browser notifications")).toBeInTheDocument();
    expect(screen.getByText(/While Brainstorm is open in a tab/)).toBeInTheDocument();
  });

  it("in a phone's installed app, says the phone pauses it — there's no tab to keep open", () => {
    as("phone app");
    render(<MessagesSettingsCard />);
    expect(screen.getByText("Notifications", { selector: "label, label *" })).toBeInTheDocument();
    expect(screen.getByText(/your phone pauses it/)).toBeInTheDocument();
    expect(screen.queryByText(/open in a tab/)).toBeNull();
  });

  it("in a desktop's installed app, promises while it's open, and nothing about phones", () => {
    as("desktop app");
    render(<MessagesSettingsCard />);
    expect(screen.getByText(/While the app is open\./)).toBeInTheDocument();
    expect(screen.queryByText(/phone/)).toBeNull();
  });
});
