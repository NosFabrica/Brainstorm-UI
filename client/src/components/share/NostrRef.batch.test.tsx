// @vitest-environment jsdom
/**
 * An article that names dozens of streams, listings or communities by `naddr`
 * asks the relays once for all of them (services/refBatch), not once per
 * reference with a timeout each.
 */
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { nip19 } from "nostr-tools";
import { renderWithProviders } from "@/test/utils";
import type { MinimalEvent } from "@/lib/noteRefs";

const PK = "4".repeat(64);
const streams = new Map<string, MinimalEvent>();
const fetchAddressable = vi.hoisted(() => vi.fn());
vi.mock("@/services/nostr", async () => ({
  ...(await import("@/test/fakeNostr")).nostrReadDefaults,
  fetchAddressableEvents: fetchAddressable,
  fetchEventsByIds: async () => [],
}));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/hooks/useNip05", () => ({ useNip05: () => "none" }));

import { NostrRef } from "./NostrRef";

describe("NostrRef — many addresses in one text", () => {
  it("are asked for in one batch", async () => {
    fetchAddressable.mockImplementation(async (refs: { kind: number; pubkey: string; identifier: string }[]) => {
      return new Map(
        refs.flatMap((r) => {
          const key = `${r.kind}:${r.pubkey}:${r.identifier}`;
          return streams.has(key) ? [[key, streams.get(key)!]] : [];
        }),
      );
    });
    const refs = Array.from({ length: 5 }, (_, i) => {
      const ev: MinimalEvent = {
        id: String(i).padStart(64, "a"),
        kind: 30311,
        pubkey: PK,
        created_at: 1_790_000_000,
        content: "",
        tags: [
          ["d", `s${i}`],
          ["title", `Stream ${i}`],
          ["status", "live"],
        ],
      };
      streams.set(`30311:${PK}:s${i}`, ev);
      return nip19.naddrEncode({ kind: 30311, pubkey: PK, identifier: `s${i}` });
    });
    renderWithProviders(
      <div>
        {refs.map((bech32) => (
          <NostrRef key={bech32} bech32={bech32} />
        ))}
      </div>,
    );
    expect(await screen.findByText("Stream 4")).toBeInTheDocument();
    expect(fetchAddressable).toHaveBeenCalledTimes(1);
    expect(fetchAddressable.mock.calls[0][0]).toHaveLength(5);
  });
});
