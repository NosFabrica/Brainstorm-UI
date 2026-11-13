// @vitest-environment node
/**
 * The Assistant's keys through brainstorm_server, as the contract fixes it: a GET the
 * reader decrypts with the Assistant as peer, a POST of the whole list encrypted to the
 * Assistant naming the version it read (`previousId` and `previousCreatedAt`), a 409 when
 * the list moved meanwhile or another edit holds the lock (read again, retry once), and the
 * 404s, 502 and 503 the screen tells apart.
 *
 * Two real key pairs: the reader's and the Assistant's. The server is a fake that holds
 * the Assistant's list and opens and seals it as the real one does.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPublicKey } from "nostr-tools/pure";
import * as nip44 from "nostr-tools/nip44";

const authenticatedFetch = vi.fn();
vi.mock("@/services/api/core", async () => ({
  authenticatedFetch: (...args: unknown[]) => authenticatedFetch(...args),
  getBrainstormApi: () => "https://api.example",
  jsonBody: (method: string, body: unknown) => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }),
}));

import { decryptAssistantKeys, editAssistantKeys, fetchAssistantKeys, postAssistantKeys } from "./assistantAgentKeys";
import { withKeyGiven, withKeyTaken } from "@/lib/assistantKeys";

const READER_SECRET = new Uint8Array(32).fill(5);
const READER = getPublicKey(READER_SECRET);
const ASSISTANT_SECRET = new Uint8Array(32).fill(9);
const ASSISTANT = getPublicKey(ASSISTANT_SECRET);
const between = nip44.getConversationKey(ASSISTANT_SECRET, READER);

const account = {
  pubkey: READER,
  type: "test",
  nip44: {
    encrypt: async (to: string, plain: string) => nip44.encrypt(plain, nip44.getConversationKey(READER_SECRET, to)),
    decrypt: async (from: string, cipher: string) =>
      nip44.decrypt(cipher, nip44.getConversationKey(READER_SECRET, from)),
  },
};

const SECRET_KEY = "sk-or-v1-0123456789abcdef-a3f9";
const GIVEN = { key: SECRET_KEY, url: "https://openrouter.ai/api/v1" };

/** The fake server: the Assistant's list, and what it answers. */
let server: {
  tags: string[][] | null;
  createdAt: number | null;
  /** The event id of the version it holds. */
  id: string | null;
  posts: { previousId: string | null; previousCreatedAt: number | null; tags: string[][] }[];
  /** The GET lags: it answers with this older version instead (a relay that hasn't the write yet). */
  stale?: { tags: string[][]; createdAt: number; id: string };
  /** Runs before each POST is judged: another edit landing meanwhile. */
  beforePost?: () => void;
  getStatus?: { status: number; reason?: string };
  postStatus?: number;
};
const urls: string[] = [];
const bodies: string[] = [];

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

beforeEach(() => {
  server = {
    tags: [
      ["key", "sk-ant-theirs-7777", "https://api.anthropic.com/v1"],
      ["note", "kept"],
    ],
    createdAt: 1794300000,
    id: "1".repeat(64),
    posts: [],
  };
  urls.length = 0;
  bodies.length = 0;
  authenticatedFetch.mockReset().mockImplementation(async (url: string, init: RequestInit = {}) => {
    urls.push(url);
    if (init.body) bodies.push(String(init.body));
    if (!init.method || init.method === "GET") {
      if (server.getStatus) {
        const { status, reason } = server.getStatus;
        return json(status, { message: "nope" }, reason ? { "X-Reason": reason } : {});
      }
      // Re-encrypted to the owner, Assistant → reader.
      const shown = server.stale ?? server;
      const ciphertext = shown.tags ? nip44.encrypt(JSON.stringify(shown.tags), between) : null;
      return json(200, {
        code: 200,
        data: { assistant: ASSISTANT, ciphertext, createdAt: shown.createdAt, id: shown.id },
      });
    }
    const body = JSON.parse(String(init.body)) as {
      ciphertext: string;
      previousId: string | null;
      previousCreatedAt: number | null;
    };
    // The server opens it as (Assistant secret, owner pubkey).
    const tags = JSON.parse(nip44.decrypt(body.ciphertext, between)) as string[][];
    server.posts.push({ previousId: body.previousId, previousCreatedAt: body.previousCreatedAt, tags });
    server.beforePost?.();
    if (server.postStatus) return json(server.postStatus, { message: "relays" });
    // Every one given must match the version it holds; neither given means there must be none.
    if (body.previousCreatedAt !== server.createdAt || body.previousId !== server.id) {
      return json(409, { message: "moved" });
    }
    server.tags = tags;
    server.createdAt = (server.createdAt ?? 0) + 100;
    server.id = String(server.createdAt % 10).repeat(64);
    return json(200, { code: 200, data: { createdAt: server.createdAt, id: server.id, relays: [] } });
  });
});

describe("reading the Assistant's list", () => {
  it("decrypts with the reader's key, the Assistant as peer", async () => {
    const got = await fetchAssistantKeys();
    expect(got).toMatchObject({ status: "ok", assistant: ASSISTANT, createdAt: 1794300000, id: "1".repeat(64) });
    if (got.status !== "ok") throw new Error();
    const read = await decryptAssistantKeys(account as never, got.assistant, got.ciphertext);
    expect(read).toEqual({ status: "ready", tags: server.tags });
  });

  it("reads no list yet as an empty one", async () => {
    server.tags = null;
    server.createdAt = null;
    server.id = null;
    const got = await fetchAssistantKeys();
    expect(got).toEqual({ status: "ok", assistant: ASSISTANT, ciphertext: null, createdAt: null, id: null });
    expect(await decryptAssistantKeys(account as never, ASSISTANT, null)).toEqual({ status: "ready", tags: [] });
  });

  it("tells no Assistant, no endpoint yet, and relays that didn't answer apart", async () => {
    server.getStatus = { status: 404, reason: "no-assistant" };
    expect(await fetchAssistantKeys()).toEqual({ status: "no-assistant" });
    server.getStatus = { status: 404 };
    expect(await fetchAssistantKeys()).toEqual({ status: "unavailable" });
    server.getStatus = { status: 502 };
    expect(await fetchAssistantKeys()).toEqual({ status: "relays" });
    server.getStatus = { status: 503 };
    expect(await fetchAssistantKeys()).toEqual({ status: "busy" });
    server.getStatus = { status: 500 };
    expect(await fetchAssistantKeys()).toEqual({ status: "error", message: "nope" });
  });

  it("refuses an answer that names no Assistant key", async () => {
    authenticatedFetch.mockResolvedValueOnce(
      json(200, { data: { assistant: "x", ciphertext: null, createdAt: null } }),
    );
    expect((await fetchAssistantKeys()).status).toBe("error");
    authenticatedFetch.mockResolvedValueOnce(
      json(200, { data: { assistant: ASSISTANT, ciphertext: null, createdAt: 1, id: "not an id" } }),
    );
    expect((await fetchAssistantKeys()).status).toBe("error");
  });

  it("a ciphertext sealed for someone else is unreadable", async () => {
    const other = nip44.encrypt("[]", nip44.getConversationKey(new Uint8Array(32).fill(3), READER));
    expect(await decryptAssistantKeys(account as never, ASSISTANT, other)).toEqual({ status: "unreadable" });
  });
});

describe("editing the Assistant's list", () => {
  it("gives a key: the whole list, encrypted to the Assistant, naming the createdAt it read", async () => {
    const out = await editAssistantKeys(account as never, (tags) => withKeyGiven(tags, GIVEN));

    expect(out).toMatchObject({ status: "ok", createdAt: 1794300100, id: server.id });
    expect(server.posts).toEqual([
      {
        previousId: "1".repeat(64),
        previousCreatedAt: 1794300000,
        tags: [
          ["key", "sk-ant-theirs-7777", "https://api.anthropic.com/v1"],
          ["key", SECRET_KEY, "https://openrouter.ai/api/v1"],
          ["note", "kept"],
        ],
      },
    ]);
    // Never in a URL, never in the clear on the wire.
    expect(urls.every((u) => u === "https://api.example/user/assistantAgentKeys")).toBe(true);
    expect(bodies.join("")).not.toContain(SECRET_KEY);
  });

  it("on a 409 reads again and retries once, keeping the edit that landed meanwhile", async () => {
    let landed = false;
    server.beforePost = () => {
      if (landed) return;
      landed = true;
      // Another app gave the Assistant a key between this read and this write.
      server.tags = [...server.tags!, ["key", "sk-other-5555", "https://api.openai.com/v1"]];
      server.createdAt = 1794300050;
      server.id = "5".repeat(64);
    };

    const out = await editAssistantKeys(account as never, (tags) => withKeyGiven(tags, GIVEN));

    expect(out.status).toBe("ok");
    expect(server.posts).toHaveLength(2);
    expect(server.posts[1]).toMatchObject({ previousId: "5".repeat(64), previousCreatedAt: 1794300050 });
    expect(server.tags!.map((t) => t[1])).toEqual(["sk-ant-theirs-7777", "sk-other-5555", SECRET_KEY, "kept"]);
  });

  it("gives up after a second 409", async () => {
    server.beforePost = () => {
      server.createdAt = (server.createdAt ?? 0) + 1;
    };
    expect(await editAssistantKeys(account as never, (tags) => withKeyGiven(tags, GIVEN))).toEqual({
      status: "conflict",
    });
    expect(server.posts).toHaveLength(2);
  });

  it("says when the relays didn't take it", async () => {
    server.postStatus = 502;
    expect(await editAssistantKeys(account as never, (tags) => withKeyTaken(tags, GIVEN))).toMatchObject({
      status: "ok",
    });
    // Nothing to take: no write at all.
    expect(server.posts).toHaveLength(0);
    expect(await editAssistantKeys(account as never, (tags) => withKeyGiven(tags, GIVEN))).toEqual({
      status: "relays",
    });
  });

  it("writes nothing without an Assistant, or before the endpoint exists", async () => {
    server.getStatus = { status: 404, reason: "no-assistant" };
    expect(await editAssistantKeys(account as never, (tags) => withKeyGiven(tags, GIVEN))).toEqual({
      status: "no-assistant",
    });
    server.getStatus = { status: 404 };
    expect(await editAssistantKeys(account as never, (tags) => withKeyGiven(tags, GIVEN))).toEqual({
      status: "unavailable",
    });
    expect(server.posts).toHaveLength(0);
  });

  it("posts straight to the endpoint with the ciphertext and the version it read", async () => {
    const ok = await postAssistantKeys(nip44.encrypt("[]", between), { id: "1".repeat(64), createdAt: 1794300000 });
    expect(ok).toEqual({ status: "ok", createdAt: 1794300100, id: "0".repeat(64) });
    expect(JSON.parse(bodies[0])).toEqual({
      ciphertext: expect.any(String),
      previousId: "1".repeat(64),
      previousCreatedAt: 1794300000,
    });
  });

  it("names no previous version, both null, when the GET had no list", async () => {
    server.tags = null;
    server.createdAt = null;
    server.id = null;
    const out = await editAssistantKeys(account as never, (tags) => withKeyGiven(tags, GIVEN));
    expect(out.status).toBe("ok");
    expect(server.posts[0]).toMatchObject({ previousId: null, previousCreatedAt: null });
  });

  it("a 409 while another edit holds the lock reads again and retries once", async () => {
    let locked = true;
    const real = authenticatedFetch.getMockImplementation()!;
    authenticatedFetch.mockImplementation(async (url: string, init: RequestInit = {}) => {
      if (init.method === "POST" && locked) {
        locked = false;
        return json(409, { message: "another edit is in progress" });
      }
      return real(url, init);
    });
    const out = await editAssistantKeys(account as never, (tags) => withKeyGiven(tags, GIVEN));
    expect(out.status).toBe("ok");
    expect(server.tags!.map((t) => t[1])).toContain(SECRET_KEY);
  });

  it("a 503 (the server's lock store down) is said as worth a retry, and nothing is written", async () => {
    server.postStatus = 503;
    expect(await editAssistantKeys(account as never, (tags) => withKeyGiven(tags, GIVEN))).toEqual({
      status: "busy",
    });
    expect(server.createdAt).toBe(1794300000);
  });

  it("builds the next edit on what the last one wrote when the GET still has the older version", async () => {
    const first = await editAssistantKeys(account as never, (tags) => withKeyGiven(tags, GIVEN));
    if (first.status !== "ok") throw new Error(first.status);
    // A lagging relay: the GET answers with the version before that write.
    server.stale = {
      tags: [
        ["key", "sk-ant-theirs-7777", "https://api.anthropic.com/v1"],
        ["note", "kept"],
      ],
      createdAt: 1794300000,
      id: "1".repeat(64),
    };
    const OTHER = { key: "sk-openai-9999", url: "https://api.openai.com/v1" };
    const second = await editAssistantKeys(account as never, (tags) => withKeyGiven(tags, OTHER), {
      assistant: first.assistant,
      tags: first.tags,
      id: first.id,
      createdAt: first.createdAt,
    });
    expect(second.status).toBe("ok");
    expect(server.posts[1]).toMatchObject({ previousId: first.id, previousCreatedAt: first.createdAt });
    // Both keys: the first edit isn't undone by the stale read.
    expect(server.tags!.map((t) => t[1])).toEqual(expect.arrayContaining([SECRET_KEY, "sk-openai-9999"]));
  });
});
