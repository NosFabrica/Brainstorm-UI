// @vitest-environment jsdom
/**
 * A profile page asks for its subject's kind-0 even when a copy is held, and
 * asks the author's own relays alongside the default set — not only when the
 * default set has nothing. An edit published only to their relays is exactly
 * the update a held copy would otherwise hide.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "nostr-tools";

const requestAllMock = vi.fn<(relays: string[]) => Promise<NostrEvent[]>>(async () => []);
vi.mock("@/lib/relayRequest", () => ({
  requestAll: (relays: string[]) => requestAllMock(relays),
  requestAllByRelay: vi.fn(),
  requestNewest: vi.fn(),
  requestOne: vi.fn(),
}));
vi.mock("@/lib/relayRouting", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/relayRouting")>()),
  warmRelayLists: () => {},
  outboxRelaysFromDb: (_pk: string, fallback: string[]) => fallback,
  outboxRelays: async (_pk: string, fallback: string[]) => ["wss://own.example/", ...fallback],
}));

import { refreshProfileEvent } from "./nostr";
import { PROFILE_RELAYS } from "@/lib/relays";

const PK = "5".repeat(64);
const kind0 = (created_at: number, name: string) =>
  ({ id: String(created_at).padStart(64, "0"), kind: 0, pubkey: PK, created_at, content: JSON.stringify({ name }), tags: [], sig: "s" }) as NostrEvent;

beforeEach(() => {
  requestAllMock.mockReset();
});

describe("refreshProfileEvent", () => {
  it("asks the author's own relays even when the default set answers, and keeps the newest", async () => {
    requestAllMock.mockImplementation(async (relays) =>
      relays.includes("wss://own.example/") ? [kind0(200, "edited on my relay")] : [kind0(100, "stale")],
    );
    const event = await refreshProfileEvent(PK, { relayHints: ["wss://hint.example/"] });
    const asked = requestAllMock.mock.calls.map((call) => call[0]);
    expect(asked[0]).toEqual(expect.arrayContaining([...PROFILE_RELAYS, "wss://hint.example/"]));
    expect(asked.flat()).toContain("wss://own.example/");
    expect(event?.created_at).toBe(200);
  });
});
