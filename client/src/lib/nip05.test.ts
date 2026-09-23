/**
 * A NIP-05 handle to a pubkey, shared: the search box resolved handles with a
 * private helper (pages/landing.tsx), and a Primal link needs the same lookup
 * for `<name>@primal.net`. One reader, cached for the session, that answers
 * null instead of throwing — a link that cannot resolve is a link, not an error.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetNip05, resolveNip05 } from "./nip05";

const PK = "75d737c3472471029c44876b330d2284288a42779b591a2ed4daa1c6c07efaf7";
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

beforeEach(() => __resetNip05());
afterEach(() => vi.unstubAllGlobals());

describe("resolveNip05", () => {
  it("asks the domain's well-known for the name, and answers the pubkey", async () => {
    const fetchMock = vi.fn(async () => ok({ names: { whitenoise: PK } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await resolveNip05("whitenoise@primal.net")).toBe(PK);
    expect(fetchMock.mock.calls[0][0]).toBe("https://primal.net/.well-known/nostr.json?name=whitenoise");
    expect((fetchMock.mock.calls[0][1] as { signal?: AbortSignal })?.signal).toBeInstanceOf(AbortSignal);
  });

  it("normalises the handle: case, and a bare domain is its `_` name", async () => {
    const fetchMock = vi.fn(async () => ok({ names: { alice: PK, _: PK } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await resolveNip05("Alice@Primal.net")).toBe(PK);
    expect(fetchMock.mock.calls[0][0]).toBe("https://primal.net/.well-known/nostr.json?name=alice");
    expect(await resolveNip05("primal.net")).toBe(PK);
    expect(fetchMock.mock.calls[1][0]).toBe("https://primal.net/.well-known/nostr.json?name=_");
  });

  it("answers null, never throws: non-2xx, a dead network, bad JSON, a missing name, a bad key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    expect(await resolveNip05("a@x.org")).toBeNull();
    __resetNip05();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("blocked"); }));
    expect(await resolveNip05("a@x.org")).toBeNull();
    __resetNip05();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200 })));
    expect(await resolveNip05("a@x.org")).toBeNull();
    __resetNip05();
    vi.stubGlobal("fetch", vi.fn(async () => ok({ names: { someone: PK } })));
    expect(await resolveNip05("a@x.org")).toBeNull();
    __resetNip05();
    vi.stubGlobal("fetch", vi.fn(async () => ok({ names: { a: "not-a-key" } })));
    expect(await resolveNip05("a@x.org")).toBeNull();
  });

  it("asks once per handle for the session", async () => {
    const fetchMock = vi.fn(async () => ok({ names: { alice: PK } }));
    vi.stubGlobal("fetch", fetchMock);
    await Promise.all([resolveNip05("alice@primal.net"), resolveNip05("ALICE@primal.net")]);
    expect(await resolveNip05("alice@primal.net")).toBe(PK);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
