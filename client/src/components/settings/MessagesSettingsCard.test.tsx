// @vitest-environment jsdom
/**
 * Settings › Messages, where the inbox's "Manage" lands: each message server
 * says whether it's working, and one that isn't answering can be swapped for a
 * suggested server in a click — published only when the reader says so.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { DmEngineState } from "@/services/dm/engine";

const ME = "m".repeat(64);
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ pubkey: ME }) }));
vi.mock("@/hooks/useDmRelays", () => ({
  useDmRelays: () => ({
    relays: ["wss://relay.damus.io/", "wss://relay.primal.net/", "wss://auth.nostr1.com/"],
    loading: false,
  }),
}));
vi.mock("@/components/settings/FileServersSection", () => ({ FileServersSection: () => null }));
vi.mock("@/components/messages/SyncDetails", () => ({ SyncDetails: () => null }));
const publishInboxRelays = vi.fn(async (_relays: string[]) => ({ success: true }));
vi.mock("@/services/dm", () => ({ publishInboxRelays: (r: string[]) => publishInboxRelays(r) }));

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
  it("says, in plain words, which servers are working", () => {
    render(<MessagesSettingsCard />);
    expect(screen.getByText("Message servers")).toBeInTheDocument();
    expect(row("relay.damus.io")).toHaveTextContent("Not answering");
    expect(row("relay.primal.net")).toHaveTextContent("Working");
    expect(row("auth.nostr1.com")).toHaveTextContent("Asks you to sign in");
  });

  it("while any server works, offers no swap — only the reassurance that messages still arrive", () => {
    state = someWorking;
    render(<MessagesSettingsCard />);
    expect(within(row("relay.damus.io")).queryByRole("button", { name: /Replace/ })).toBeNull();
    expect(screen.getByTestId("dm-servers-note")).toHaveTextContent(
      "Messages still reach you through your other servers.",
    );
    expect(screen.queryByRole("button", { name: "Use suggested servers" })).toBeNull();
  });

  it("when none answer, offers the suggested servers — explained, and published only once confirmed", () => {
    state = allSilent;
    render(<MessagesSettingsCard />);
    fireEvent.click(screen.getByRole("button", { name: "Use suggested servers" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("New messages will go to auth.nostr1.com and nos.lol");
    expect(dialog).toHaveTextContent("Messages on your current servers won't load until you add them back");
    expect(publishInboxRelays).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Switch and publish" }));
    expect(publishInboxRelays).toHaveBeenCalledWith(["wss://auth.nostr1.com/", "wss://nos.lol/"]);
    state = someWorking;
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
