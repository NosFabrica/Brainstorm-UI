/**
 * A zap poll's card re-tallies every receipt each time one more arrives. Each
 * receipt's request is checked once, ever — keyed on the receipt, never on
 * anything the request claims — so a second tally over the same receipts runs
 * no signature check, however many there are (past any bounded cache's size).
 */
import { describe, expect, it, vi } from "vitest";

const verified = vi.hoisted(() => ({ calls: 0 }));
vi.mock("nostr-tools", async (importOriginal) => {
  const real = await importOriginal<typeof import("nostr-tools")>();
  // The synthetic requests carry no real signature: count the checks, believe them all.
  return {
    ...real,
    verifyEvent: () => {
      verified.calls++;
      return true;
    },
  };
});

import { parseZapPoll, tallyZapPoll } from "./polls";

const POLL_ID = "9".repeat(64);
const AUTHOR = "a".repeat(64);
const hex = (i: number, len: number) => i.toString(16).padStart(len, "0");

describe("a zap poll's tally over thousands of receipts", () => {
  const poll = parseZapPoll({
    id: POLL_ID,
    pubkey: AUTHOR,
    kind: 6969,
    created_at: 1,
    content: "q",
    tags: [
      ["poll_option", "0", "a"],
      ["poll_option", "1", "b"],
    ],
  })!;
  const N = 5200;
  const receipts = Array.from({ length: N }, (_, i) => {
    const request = {
      id: hex(i + 1, 64),
      pubkey: hex(i + 1, 64),
      sig: hex(i + 1, 128),
      kind: 9734,
      created_at: 100 + i,
      content: "",
      tags: [
        ["p", AUTHOR],
        ["e", POLL_ID],
        ["amount", "1000"],
        ["poll_option", String(i % 2)],
      ],
    };
    return {
      id: hex(N + i + 1, 64),
      pubkey: "f".repeat(64),
      kind: 9735,
      created_at: 100 + i,
      content: "",
      tags: [
        ["p", AUTHOR],
        ["e", POLL_ID],
        ["bolt11", "lnbc10n1x"],
        ["description", JSON.stringify(request)],
      ],
    };
  });

  it("checks each receipt's request once, and a second tally checks none", () => {
    const first = tallyZapPoll(poll, receipts);
    expect(first.zaps).toBe(N);
    expect(verified.calls).toBe(N);
    const second = tallyZapPoll(poll, receipts);
    expect(second.total).toBe(first.total);
    expect(verified.calls).toBe(N);
    // One more arriving re-tallies the rest without re-checking them.
    tallyZapPoll(poll, receipts.slice(0, N - 1));
    expect(verified.calls).toBe(N);
  });
});
