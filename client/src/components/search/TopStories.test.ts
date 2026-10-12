/**
 * Which hits earn the Top stories strip. The strip draws a picture large, with no way to ask
 * first, so a video its creator marked sensitive stays out of it and reads as a row.
 */
import { describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "nostr-tools";
import type { SearchHit } from "@/services/search";

vi.mock("@/services/nostr", async () => ({ ...(await import("@/test/fakeNostr")).nostrReadDefaults }));
vi.mock("@/lib/eventStore", async () => ({
  eventStore: { ...(await import("@/test/fakeEventStore")).eventStoreDefaults },
}));

import { pickTopStories } from "./RichSections";

const hit = (n: number, kind: number, tags: string[][] = []): SearchHit =>
  ({
    event: {
      id: String(n).repeat(64),
      kind,
      pubkey: String(n).repeat(64),
      created_at: 1_790_000_000 - n,
      sig: "s",
      content: `Story number ${n} https://cdn.example/${n}.jpg`,
      tags: [["image", `https://cdn.example/${n}.jpg`], ...tags],
    } as NostrEvent,
    author: null,
  }) as SearchHit;

describe("pickTopStories — a video marked sensitive", () => {
  it("keeps a flagged video out of the strip, whichever video kind it is", () => {
    for (const kind of [21, 22, 34235, 34236]) {
      const stories = pickTopStories([hit(1, 1), hit(2, kind, [["content-warning", "nudity"]]), hit(3, 1), hit(4, 1)]);
      expect(stories.map((s) => s.hit.event.id[0])).toEqual(["1", "3", "4"]);
    }
  });

  it("leaves an unflagged video, and a flagged note, where they were", () => {
    const stories = pickTopStories([hit(1, 1, [["content-warning"]]), hit(2, 34236), hit(3, 1)]);
    expect(stories.map((s) => s.hit.event.id[0])).toEqual(["1", "2", "3"]);
  });
});
