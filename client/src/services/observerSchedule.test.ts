// @vitest-environment node
/**
 * Editing the morning schedule is a read-modify-write of one replaceable event: it keeps
 * what Amethyst wrote there, puts only ciphertext and the `d` tag on the wire, lands after
 * the copy it read, and writes nothing when it can't tell what is there.
 *
 * Node, not jsdom: the events are really signed and really encrypted. No relay is ever
 * reached: the read and the publish are both mocked.
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
  outboxRelays: async () => ["wss://r0", "wss://r1"],
}));

vi.mock("@/lib/relayPool", () => ({
  pool: {
    publish: (...args: unknown[]) => publish(...args),
    relay: (url: string) => ({ publish: (event: unknown) => publish([url], event).then((r: unknown[]) => r[0]) }),
    request: () => EMPTY,
  },
}));

vi.mock("@/accounts/signing", async (original) => ({
  ...(await original<typeof import("@/accounts/signing")>()),
  activeAccount: () => activeAccount(),
  signAs: (...args: unknown[]) => signAs(...args),
}));

const SECRET = new Uint8Array(32).fill(5);
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

const reachAll = { asked: ["wss://r0", "wss://r1"], answered: ["wss://r0", "wss://r1"] };
const reachNone = { asked: ["wss://r0", "wss://r1"], answered: [] as string[] };

// What Amethyst wrote: private tags, with the claim and ran of the device that printed
// (Brainstorm only ever carries them over), and an option of the task's own.
const amethystPrivate = [
  ["task", "observer"],
  ["cron", "0 6 * * 1,3", "America/New_York"],
  ["claim", "1794398400", "3f1c9a0e5b7d4c21", "Desktop (Linux)"],
  ["ran", "1794398520"],
  ["desk", "tech"],
];

function scheduleEvent(
  privateTags: string[][] | string,
  createdAt = 2_000_000_000,
  publicTags: string[][] = [["d", "observer"]],
) {
  const plain = typeof privateTags === "string" ? privateTags : JSON.stringify(privateTags);
  return finalizeEvent(
    { kind: 34817, created_at: createdAt, tags: publicTags, content: nip44.encrypt(plain, toSelf) },
    SECRET,
  );
}

const published = () =>
  publish.mock.calls[0][1] as { kind: number; tags: string[][]; content: string; created_at: number };
const decrypted = () => JSON.parse(nip44.decrypt(published().content, toSelf)) as string[][];

let service: typeof import("./observerSchedule");
let lib: typeof import("@/lib/frontPage/observerSchedule");
let tasks: typeof import("@/lib/scheduledTasks");
let store: typeof import("@/lib/eventStore");

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  activeAccount.mockReturnValue(account);
  publish.mockResolvedValue([{ ok: true, from: "wss://r0", message: "" }]);
  signAs.mockImplementation(async (_account: unknown, template: { kind: number }) =>
    finalizeEvent({ created_at: 0, tags: [], content: "", ...template } as never, SECRET),
  );
  service = await import("./observerSchedule");
  lib = await import("@/lib/frontPage/observerSchedule");
  tasks = await import("@/lib/scheduledTasks");
  store = await import("@/lib/eventStore");
});

describe("no write without a read", () => {
  it("writes nothing when no relay answered and nothing is held", async () => {
    requestNewestWithReach.mockResolvedValue({ newest: undefined, reach: reachNone });

    const res = await service.updateObserverSchedule((d) => tasks.setEnabled(d, false));

    expect(res.success).toBe(false);
    expect(signAs).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("writes nothing when only half of the relays answered", async () => {
    requestNewestWithReach.mockResolvedValue({
      newest: scheduleEvent(amethystPrivate),
      reach: { ...reachAll, answered: ["wss://r0"] },
    });

    const res = await service.updateObserverSchedule((d) => tasks.setEnabled(d, false));

    expect(res.success).toBe(false);
    expect(signAs).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("writes nothing when no relay answered, even with a copy in the store", async () => {
    // NIP-FB: a stale copy would roll back the devices' latest claim and ran.
    store.eventStore.add(scheduleEvent(amethystPrivate));
    requestNewestWithReach.mockResolvedValue({ newest: undefined, reach: reachNone });

    const res = await service.updateObserverSchedule((d) => tasks.setEnabled(d, false));

    expect(res.success).toBe(false);
    expect(signAs).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("writes nothing when the newest copy can't be decrypted", async () => {
    const foreign = finalizeEvent(
      { kind: 34817, created_at: 2_000_000_000, tags: [["d", "observer"]], content: "garbage" },
      SECRET,
    );
    requestNewestWithReach.mockResolvedValue({ newest: foreign, reach: reachAll });

    const res = await service.updateObserverSchedule((d) => tasks.setEnabled(d, false));

    expect(res.success).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });

  it("writes nothing when the newest copy's private part isn't a tag list", async () => {
    requestNewestWithReach.mockResolvedValue({ newest: scheduleEvent('{"task":"observer"}'), reach: reachAll });

    const res = await service.updateObserverSchedule((d) => tasks.setEnabled(d, false));

    expect(res.success).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });

  it("writes nothing when the edit is refused (a time that isn't one)", async () => {
    requestNewestWithReach.mockResolvedValue({ newest: scheduleEvent(amethystPrivate), reach: reachAll });

    const res = await service.updateObserverSchedule((d) =>
      tasks.setSimpleSchedule(d, { time: "25:00", days: ["mon"] }, "UTC"),
    );

    expect(res.success).toBe(false);
    expect(signAs).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});

describe("editing", () => {
  it("keeps every tag it didn't change, on its side, and puts the private ones in ciphertext", async () => {
    const before = scheduleEvent(amethystPrivate);
    requestNewestWithReach.mockResolvedValue({ newest: before, reach: reachAll });

    const res = await service.updateObserverSchedule((d) =>
      tasks.setSimpleSchedule(d, { time: "07:30", days: ["mon", "wed"] }, "Europe/Lisbon"),
    );

    expect(res.success).toBe(true);
    expect(published().kind).toBe(34817);
    expect(published().tags).toEqual([["d", "observer"]]);
    expect(published().content).not.toContain("Desktop");
    // claim, ran and the option: as Amethyst wrote them, in place.
    expect(decrypted()).toEqual([
      ["task", "observer"],
      ["cron", "30 7 * * 1,3", "Europe/Lisbon"],
      ["claim", "1794398400", "3f1c9a0e5b7d4c21", "Desktop (Linux)"],
      ["ran", "1794398520"],
      ["desk", "tech"],
    ]);
    expect(published().created_at).toBe(before.created_at + 1);
  });

  it("keeps public tags public and private ones private, merging both to read", async () => {
    const before = scheduleEvent(
      [
        ["task", "observer"],
        ["claim", "1794398400", "3f1c", "Desktop (Linux)"],
      ],
      2_000_000_000,
      [
        ["d", "observer"],
        ["cron", "0 6 * * *", "America/New_York"],
        ["future", "x"],
      ],
    );
    requestNewestWithReach.mockResolvedValue({ newest: before, reach: reachAll });

    await service.updateObserverSchedule((d) =>
      tasks.setEnabled(tasks.setSimpleSchedule(d, { time: "07:00", days: [...tasks.WEEKDAYS] }, "UTC"), false),
    );

    // The cron it found public stays public; paused, new, goes private.
    expect(published().tags).toEqual([
      ["d", "observer"],
      ["cron", "0 7 * * *", "UTC"],
      ["future", "x"],
    ]);
    expect(decrypted()).toEqual([["task", "observer"], ["claim", "1794398400", "3f1c", "Desktop (Linux)"], ["paused"]]);
  });

  it("reads an event with no private part, and names the task if no tag does", async () => {
    const bare = finalizeEvent(
      {
        kind: 34817,
        created_at: 2_000_000_000,
        tags: [
          ["d", "observer"],
          ["cron", "0 6 * * *", "UTC"],
        ],
        content: "",
      },
      SECRET,
    );
    requestNewestWithReach.mockResolvedValue({ newest: bare, reach: reachAll });

    const res = await service.updateObserverSchedule((d) => tasks.setEnabled(d, false));

    expect(res.success).toBe(true);
    expect(published().tags).toEqual([
      ["d", "observer"],
      ["cron", "0 6 * * *", "UTC"],
    ]);
    expect(decrypted()).toEqual([["paused"], ["task", "observer"]]);
  });

  it("starts from the store's copy when it is newer than what the relays returned", async () => {
    const older = scheduleEvent(
      [
        ["task", "observer"],
        ["cron", "0 5 * * *", "UTC"],
      ],
      2_000_000_000,
    );
    const newer = scheduleEvent(amethystPrivate, 2_000_000_100);
    store.eventStore.add(newer);
    requestNewestWithReach.mockResolvedValue({ newest: older, reach: reachAll });

    await service.updateObserverSchedule((d) => tasks.setEnabled(d, false));

    expect(decrypted()).toContainEqual(["cron", "0 6 * * 1,3", "America/New_York"]);
    expect(published().created_at).toBe(newer.created_at + 1);
  });

  it("starts a new schedule when the relays answered and none holds one", async () => {
    requestNewestWithReach.mockResolvedValue({ newest: undefined, reach: reachAll });

    const res = await service.updateObserverSchedule((d) =>
      tasks.setSimpleSchedule(d, { time: "06:00", days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] }, "UTC"),
    );

    expect(res.success).toBe(true);
    expect(decrypted()).toEqual([["task", "observer"], ["paused"], ["cron", "0 6 * * *", "UTC"]]);
  });

  it("asks the relays for the one schedule event", async () => {
    requestNewestWithReach.mockResolvedValue({ newest: undefined, reach: reachNone });
    await service.updateObserverSchedule((d) => d);
    expect(requestNewestWithReach.mock.calls[0][1]).toEqual({
      kinds: [34817],
      authors: [PUBKEY],
      "#d": ["observer"],
    });
    expect(lib.SCHEDULE_KIND).toBe(34817);
  });

  it("does nothing signed out", async () => {
    activeAccount.mockReturnValue(undefined);
    const res = await service.updateObserverSchedule((d) => d);
    expect(res.success).toBe(false);
    expect(requestNewestWithReach).not.toHaveBeenCalled();
  });
});
