import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetNip05Cache, parseNip05, verifyNip05 } from "./nip05";

const HZRD = "266815e0c9210dfa324c6cba3573b14bee49da4209a9456f9484e5106cd408a5";
const COPYCAT = "e48465b08afc" + "0".repeat(52);

function stubNames(names: Record<string, string>) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ names }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => __resetNip05Cache());
afterEach(() => vi.unstubAllGlobals());

describe("parseNip05", () => {
  it("reads name@domain, _@domain and bare domains, lowercased", () => {
    expect(parseNip05("Bob@Example.com")).toEqual({ name: "bob", domain: "example.com" });
    expect(parseNip05("_@hzrd149.com")).toEqual({ name: "_", domain: "hzrd149.com" });
    expect(parseNip05("hzrd149.com")).toEqual({ name: "_", domain: "hzrd149.com" });
  });
  it("rejects junk", () => {
    expect(parseNip05("")).toBeNull();
    expect(parseNip05("not a handle")).toBeNull();
    expect(parseNip05("a@localhost")).toBeNull();
    expect(parseNip05("a@evil.com/path?x=")).toBeNull();
  });
});

describe("verifyNip05", () => {
  it("verifies only the pubkey the domain names — copycats claiming the same handle are invalid", async () => {
    const fetchMock = stubNames({ _: HZRD, hzrd149: HZRD });
    expect(await verifyNip05("_@hzrd149.com", HZRD)).toBe("verified");
    expect(await verifyNip05("_@hzrd149.com", COPYCAT)).toBe("invalid");
    // One lookup serves every profile claiming the same identifier.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://hzrd149.com/.well-known/nostr.json?name=_");
  });

  it("is case-insensitive on the name and the key", async () => {
    stubNames({ hzrd149: HZRD });
    expect(await verifyNip05("HZRD149@hzrd149.com", HZRD.toUpperCase())).toBe("verified");
  });

  it("a name the domain doesn't list is invalid", async () => {
    stubNames({ someoneelse: HZRD });
    expect(await verifyNip05("hzrd149@hzrd149.com", HZRD)).toBe("invalid");
  });

  it("an unreachable domain is unknown, not verified", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect(await verifyNip05("_@down.example", HZRD)).toBe("unknown");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    expect(await verifyNip05("_@missing.example", HZRD)).toBe("unknown");
  });

  it("refuses redirects, per NIP-05", async () => {
    const fetchMock = stubNames({ _: HZRD });
    await verifyNip05("_@hzrd149.com", HZRD);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "error" });
  });

  it("a malformed claim or key is invalid without a fetch", async () => {
    const fetchMock = stubNames({});
    expect(await verifyNip05("garbage", HZRD)).toBe("invalid");
    expect(await verifyNip05("_@hzrd149.com", "npub1xyz")).toBe("invalid");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
