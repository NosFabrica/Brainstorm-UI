// @vitest-environment node
/**
 * Editing the AI agent keys is a read-modify-write of a replaceable event: it must
 * keep what other apps stored there, put only ciphertext on the wire, and write
 * nothing when it can't tell what is already there.
 *
 * Node, not jsdom: the events are really signed and really encrypted.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY } from "rxjs";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import * as nip44 from "nostr-tools/nip44";

const publish = vi.fn();
const signAs = vi.fn();
const activeAccount = vi.fn();
const requestNewestWithReach = vi.fn();

vi.mock("@/lib/relayRequest", async (original) => ({
  ...(await original<typeof import("@/lib/relayRequest")>()),
  requestNewestWithReach: (...args: unknown[]) => requestNewestWithReach(...args),
}));

vi.mock("@/lib/relayRouting", async (original) => ({
  ...(await original<typeof import("@/lib/relayRouting")>()),
  outboxRelays: async () => ["wss://r0", "wss://r1", "wss://r2"],
}));

vi.mock("@/lib/relayPool", () => ({
  pool: { publish: (...args: unknown[]) => publish(...args), request: () => EMPTY },
}));

vi.mock("@/accounts/signing", async (original) => ({
  ...(await original<typeof import("@/accounts/signing")>()),
  activeAccount: () => activeAccount(),
  signAs: (...args: unknown[]) => signAs(...args),
}));

const SECRET = new Uint8Array(32).fill(3);
const PUBKEY = getPublicKey(SECRET);
const toSelf = nip44.getConversationKey(SECRET, PUBKEY);
const account = {
  pubkey: PUBKEY,
  type: "test",
  nip44: {
    encrypt: async (_to: string, plain: string) => nip44.encrypt(plain, toSelf),
    decrypt: async (_from: string, cipher: string) => nip44.decrypt(cipher, toSelf),
  },
};

const openRouter = { key: "sk-or-v1-secret-value-1234", url: "https://openrouter.ai/api/v1" };
const ollama = { key: "", url: "http://localhost:11434/v1" };

const reachAll = { asked: ["wss://r0", "wss://r1", "wss://r2"], answered: ["wss://r0", "wss://r1", "wss://r2"] };

function earlier(privateTags: string[][], extraTags: string[][] = []) {
  return finalizeEvent(
    {
      kind: 12000,
      created_at: 2_000_000_000,
      tags: [["alt", "AI agent keys (encrypted)"], ...extraTags],
      content: nip44.encrypt(JSON.stringify(privateTags), toSelf),
    },
    SECRET,
  );
}

const published = () =>
  publish.mock.calls[0][1] as { kind: number; tags: string[][]; content: string; created_at: number };
const decrypted = () => JSON.parse(nip44.decrypt(published().content, toSelf)) as string[][];

let service: typeof import("./agentKeys");
let lib: typeof import("@/lib/agentKeys");

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  activeAccount.mockReturnValue(account);
  publish.mockResolvedValue([{ ok: true, from: "wss://r0", message: "" }]);
  signAs.mockImplementation(async (_account: unknown, template: { kind: number }) =>
    finalizeEvent({ created_at: 0, tags: [], content: "", ...template } as never, SECRET),
  );
  service = await import("./agentKeys");
  lib = await import("@/lib/agentKeys");
});

describe("saving the first key", () => {
  it("publishes only ciphertext, readable with the account's own key", async () => {
    requestNewestWithReach.mockResolvedValue({ newest: undefined, reach: reachAll });

    const res = await service.updateAgentKeys((keys) => lib.addKey(keys, openRouter));

    expect(res.success).toBe(true);
    expect(published().kind).toBe(12000);
    // The older copy's `alt` (NIP-31, unrecommended) is not carried forward.
    expect(published().tags).toEqual([]);
    expect(JSON.stringify(published())).not.toContain(openRouter.key);
    expect(decrypted()).toEqual([["key", openRouter.key, openRouter.url]]);
  });

  it("writes nothing when too few relays answered to know there is no event", async () => {
    requestNewestWithReach.mockResolvedValue({
      newest: undefined,
      reach: { asked: reachAll.asked, answered: ["wss://r0"] },
    });

    const res = await service.updateAgentKeys((keys) => lib.addKey(keys, openRouter));

    expect(res.success).toBe(false);
    expect(signAs).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});

describe("editing an existing event", () => {
  it("keeps other apps' private tags and public tags, and lands after the copy it read", async () => {
    const before = earlier(
      [
        ["key", openRouter.key, openRouter.url],
        ["model", "anthropic/claude"],
      ],
      [["-"]],
    );
    requestNewestWithReach.mockResolvedValue({ newest: before, reach: reachAll });

    const res = await service.updateAgentKeys((keys) => lib.makePreferred(lib.addKey(keys, ollama), ollama));

    expect(res.success).toBe(true);
    expect(decrypted()).toEqual([
      ["key", "", ollama.url],
      ["key", openRouter.key, openRouter.url],
      ["model", "anthropic/claude"],
    ]);
    expect(published().tags).toEqual([["-"]]);
    expect(published().created_at).toBe(before.created_at + 1);
  });

  it("removing the last key still encrypts something: an empty list", async () => {
    requestNewestWithReach.mockResolvedValue({
      newest: earlier([["key", openRouter.key, openRouter.url]]),
      reach: reachAll,
    });

    const res = await service.updateAgentKeys((keys) => lib.removeKey(keys, openRouter));

    expect(res.success).toBe(true);
    expect(decrypted()).toEqual([]);
  });

  it("rewrites from the store's copy when it is newer than what the relays answered with", async () => {
    // Relays that answered hold an older copy; this session already saw (or wrote) a newer one.
    const old = earlier([["key", openRouter.key, openRouter.url]]);
    const newer = finalizeEvent(
      {
        kind: 12000,
        created_at: old.created_at + 50,
        tags: [],
        content: nip44.encrypt(
          JSON.stringify([
            ["key", openRouter.key, openRouter.url],
            ["key", "", ollama.url],
          ]),
          toSelf,
        ),
      },
      SECRET,
    );
    const { eventStore } = await import("@/lib/eventStore");
    eventStore.add(newer);
    requestNewestWithReach.mockResolvedValue({ newest: old, reach: reachAll });

    const res = await service.updateAgentKeys((keys) => lib.removeKey(keys, openRouter));

    expect(res.success).toBe(true);
    expect(decrypted()).toEqual([["key", "", ollama.url]]);
    expect(published().created_at).toBe(newer.created_at + 1);
  });

  it("writes nothing over a copy it can't read", async () => {
    const unreadable = finalizeEvent({ kind: 12000, created_at: 1, tags: [], content: "garbage" }, SECRET);
    requestNewestWithReach.mockResolvedValue({ newest: unreadable, reach: reachAll });

    const res = await service.updateAgentKeys((keys) => lib.addKey(keys, openRouter));

    expect(res.success).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });
});

describe("testing a key", () => {
  it("reports a rejected key and an unreachable host apart", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    expect(await service.testAgentKey(openRouter)).toEqual({ status: "rejected" });

    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await service.testAgentKey(ollama)).toEqual({ status: "unreachable" });

    // OpenRouter's model list is public, so the key is checked at `/key`, which describes it.
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { label: "sk-or-v1-abc" } }), { status: 200 }));
    expect(await service.testAgentKey(openRouter)).toEqual({ status: "ok", models: null });
    expect(fetchMock.mock.calls[2][0]).toBe("https://openrouter.ai/api/v1/key");
    vi.unstubAllGlobals();
  });
});
