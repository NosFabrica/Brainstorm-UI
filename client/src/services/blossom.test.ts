import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signAs = vi.fn(async (_account: unknown, template: Record<string, unknown>) => ({
  ...template,
  id: "e".repeat(64),
  sig: "s".repeat(128),
}));

vi.mock("@/accounts", () => ({ accountManager: { active: null } }));
vi.mock("@/accounts/signing", () => ({
  activeAccount: () => ({ pubkey: "a".repeat(64) }),
  signAs: (...args: unknown[]) => signAs(...(args as [unknown, Record<string, unknown>])),
  signingFailure: vi.fn(),
}));
vi.mock("@/lib/eventStore", () => ({ eventStore: { add: vi.fn() } }));
vi.mock("@/services/nostr", () => ({ publishToRelays: vi.fn() }));

import { serverScopeTags, uploadToBlossom } from "./blossom";

describe("serverScopeTags", () => {
  it("names each server's lowercase domain once, dropping scheme, port and path", () => {
    expect(
      serverScopeTags([
        "https://Nostr.Download",
        "https://nostr.download/",
        "https://cdn.example.com:8443/blossom",
        "nope",
      ]),
    ).toEqual([
      ["server", "nostr.download"],
      ["server", "cdn.example.com"],
    ]);
  });
});

describe("uploadToBlossom", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    signAs.mockClear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("scopes its one auth token (BUD-11) to exactly the servers it tries", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("", { status: 415 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: "https://b.example/x" }), { status: 200 }));

    const url = await uploadToBlossom(new Blob(["hi"]), "Upload", ["https://a.example", "https://b.example"]);

    expect(url).toBe("https://b.example/x");
    expect(signAs).toHaveBeenCalledTimes(1);
    const tags = (signAs.mock.calls[0][1] as { tags: string[][] }).tags;
    expect(tags.filter((t) => t[0] === "server")).toEqual([
      ["server", "a.example"],
      ["server", "b.example"],
    ]);
    // Both attempts carry the same scoped token.
    const auths = fetchMock.mock.calls.map((c) => (c[1] as RequestInit).headers as Record<string, string>);
    expect(auths[0].Authorization).toBe(auths[1].Authorization);
    const event = JSON.parse(atob(auths[0].Authorization.replace(/^Nostr /, "")));
    expect(event.tags).toContainEqual(["server", "b.example"]);
  });
});
