/**
 * Publishing to many relays without waiting on the slowest: answer once
 * enough have accepted, and stop counting on a relay that never answers.
 * Seen 2026-09-18: one silent relay kept the Update button spinning for the
 * relay library's full 30 seconds, long after the fast relays had it.
 */
import { describe, expect, it } from "vitest";
import { publishUntilEnough, type PublishOutcome } from "./publishQuorum";

const ok = (from: string): Promise<PublishOutcome> => Promise.resolve({ ok: true, from });
const refused = (from: string): Promise<PublishOutcome> => Promise.resolve({ ok: false, from, message: "blocked" });
const silent = (): Promise<PublishOutcome> => new Promise(() => {});

describe("publishUntilEnough", () => {
  it("answers once enough relays accept, without waiting on a silent one", async () => {
    const send = (r: string) => (r === "wss://slow" ? silent() : ok(r));

    const res = await publishUntilEnough(["wss://a", "wss://b", "wss://slow"], send, { need: 2, timeoutMs: 60_000 });

    expect(res.accepted).toEqual(["wss://a", "wss://b"]);
    expect(res.total).toBe(3);
  });

  it("stops counting on a relay that never answers once the cap passes", async () => {
    const send = (r: string) => (r === "wss://slow" ? silent() : ok(r));

    const res = await publishUntilEnough(["wss://a", "wss://slow"], send, { need: 2, timeoutMs: 20 });

    expect(res.accepted).toEqual(["wss://a"]);
    expect(res.failed).toEqual([{ ok: false, from: "wss://slow", message: "timed out" }]);
  });

  it("reports nothing accepted when every relay refuses", async () => {
    const res = await publishUntilEnough(["wss://a", "wss://b"], refused, { need: 2, timeoutMs: 1000 });

    expect(res.accepted).toEqual([]);
    expect(res.failed.map((f) => f.from)).toEqual(["wss://a", "wss://b"]);
  });
});
