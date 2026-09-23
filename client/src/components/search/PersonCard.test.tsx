import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { __resetNip05Cache } from "@/lib/nip05";

// The endorsement slots need accounts and the server; this suite is about the handle.
vi.mock("@/components/search/EndorsementLine", () => ({
  FlaggedChip: () => null,
  PersonCardSlot: () => null,
}));
import { PersonCard } from "./PersonCard";
import type { SearchResult } from "@/lib/profileSearch";

const HZRD = "266815e0c9210dfa324c6cba3573b14bee49da4209a9456f9484e5106cd408a5";
const COPYCAT = "e48465b08afc" + "0".repeat(52);

const person = (pubkey: string): SearchResult => ({
  pubkey,
  npub: "npub1" + pubkey.slice(0, 8),
  name: "hzrd149",
  nip05: "_@hzrd149.com",
  wotRank: null,
  wotFollowers: null,
});

beforeEach(() => {
  __resetNip05Cache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).includes("/.well-known/nostr.json")
        ? new Response(JSON.stringify({ names: { _: HZRD } }), { status: 200 })
        : new Response("{}", { status: 200 }),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("PersonCard nip05", () => {
  it("checks the handle only for the key its domain names", async () => {
    render(<PersonCard result={person(HZRD)} idx={0} pov="nosfabrica" onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("text-nip05-0")).toHaveAttribute("data-nip05-status", "verified"));
    expect(screen.getByTestId("text-nip05-0").querySelector("svg")).not.toBeNull();
  });

  it("drops a copycat's claimed handle — no check, no handle", async () => {
    render(<PersonCard result={person(COPYCAT)} idx={1} pov="nosfabrica" onOpen={() => {}} />);
    // Unconfirmed at first: shown bare, never with the check.
    expect(screen.getByTestId("text-nip05-1").querySelector("svg")).toBeNull();
    await waitFor(() => expect(screen.queryByTestId("text-nip05-1")).toBeNull());
  });
});
