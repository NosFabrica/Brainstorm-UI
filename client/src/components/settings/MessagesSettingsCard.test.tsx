// @vitest-environment jsdom
/**
 * Settings › Messages, where the inbox's "Manage" lands: each message server
 * says whether it's working, and one that isn't answering can be swapped for a
 * suggested server in a click — published only when the reader says so.
 */
import { describe, expect, it, vi } from "vitest";
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

const state = {
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

  it("swaps a server that isn't answering for a suggested one, and publishes only when asked", () => {
    render(<MessagesSettingsCard />);
    fireEvent.click(within(row("relay.damus.io")).getByRole("button", { name: "Replace relay.damus.io" }));
    expect(screen.queryByTestId("dm-server-relay.damus.io")).toBeNull();
    expect(row("nos.lol")).toBeInTheDocument();
    expect(publishInboxRelays).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("button-publish-inbox-relays"));
    expect(publishInboxRelays).toHaveBeenCalledWith([
      "wss://nos.lol/",
      "wss://relay.primal.net/",
      "wss://auth.nostr1.com/",
    ]);
  });
});
