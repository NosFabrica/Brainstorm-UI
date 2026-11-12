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
import type { Weekday } from "@/lib/scheduledTasks";

const publish = vi.fn();
const signAs = vi.fn();
const activeAccount = vi.fn();
const requestNewestWithReach = vi.fn();
const loadFreshRelayList = vi.fn();
/** A fresh read of the relay list found `list`, or none when null. */
const relayListIs = (list: { write: string[]; read: string[] } | null) =>
  loadFreshRelayList.mockResolvedValue(list ? { status: "found", list } : { status: "none" });

vi.mock("@/lib/relayRequest", async (original) => ({
  ...(await original<typeof import("@/lib/relayRequest")>()),
  requestNewestWithReach: (...args: unknown[]) => requestNewestWithReach(...args),
}));

// The user's NIP-65 list names two write relays; our fallback set is never asked.
vi.mock("@/lib/relayRouting", async (original) => ({
  ...(await original<typeof import("@/lib/relayRouting")>()),
  loadFreshRelayList: (...args: unknown[]) => loadFreshRelayList(...args),
  loadRelayList: async () => ({ write: ["wss://r0", "wss://r1"], read: [] }),
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
// A real NIP-44 conversation with whichever peer is asked: self, or the Assistant.
const account = {
  pubkey: PUBKEY,
  type: "test",
  nip44: {
    encrypt: async (to: string, plain: string) => nip44.encrypt(plain, nip44.getConversationKey(SECRET, to)),
    decrypt: async (from: string, cipher: string) => nip44.decrypt(cipher, nip44.getConversationKey(SECRET, from)),
  },
};

const NOW = Date.UTC(2026, 10, 11, 16, 0);
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
  relayListIs({ write: ["wss://r0", "wss://r1"], read: [] });
  requestNewestWithReach.mockImplementation(async () => ({ newest: undefined, reach: reachNone }));
  publish.mockResolvedValue([{ ok: true, from: "wss://r0", message: "" }]);
  signAs.mockImplementation(async (_account: unknown, template: { kind: number }) =>
    finalizeEvent({ created_at: 0, tags: [], content: "", ...template } as never, SECRET),
  );
  service = await import("./observerSchedule");
  lib = await import("@/lib/frontPage/observerSchedule");
  tasks = await import("@/lib/scheduledTasks");
  store = await import("@/lib/eventStore");
});

describe("loading the schedule", () => {
  it("asks the write relays and the floor at once, settled by the write relays", async () => {
    await service.loadObserverSchedule("a".repeat(64));
    const [relays, , , opts] = requestNewestWithReach.mock.calls.at(-1)!;
    expect(relays).toEqual(expect.arrayContaining(["wss://r0/", "wss://r1/"]));
    expect((relays as string[]).length).toBeGreaterThan(2);
    expect(opts).toEqual({ settleOn: ["wss://r0/", "wss://r1/"] });
  });
});

describe("no write without a read", () => {
  it("writes nothing when no relay answered and nothing is held", async () => {
    requestNewestWithReach.mockResolvedValue({ newest: undefined, reach: reachNone });

    const res = await service.updateObserverSchedule((d) => tasks.setEnabled(d, false, NOW));

    expect(res.success).toBe(false);
    expect(signAs).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("writes nothing when only half of the relays answered", async () => {
    requestNewestWithReach.mockResolvedValue({
      newest: scheduleEvent(amethystPrivate),
      reach: { ...reachAll, answered: ["wss://r0"] },
    });

    const res = await service.updateObserverSchedule((d) => tasks.setEnabled(d, false, NOW));

    expect(res.success).toBe(false);
    expect(signAs).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("writes nothing when no relay answered, even with a copy in the store", async () => {
    // NIP-FB: a stale copy would roll back the devices' latest claim and ran.
    store.eventStore.add(scheduleEvent(amethystPrivate));
    requestNewestWithReach.mockResolvedValue({ newest: undefined, reach: reachNone });

    const res = await service.updateObserverSchedule((d) => tasks.setEnabled(d, false, NOW));

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

    const res = await service.updateObserverSchedule((d) => tasks.setEnabled(d, false, NOW));

    expect(res.success).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });

  it("writes nothing when the newest copy's private part isn't a tag list", async () => {
    requestNewestWithReach.mockResolvedValue({ newest: scheduleEvent('{"task":"observer"}'), reach: reachAll });

    const res = await service.updateObserverSchedule((d) => tasks.setEnabled(d, false, NOW));

    expect(res.success).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });

  it("writes nothing when the edit is refused (a time that isn't one)", async () => {
    requestNewestWithReach.mockResolvedValue({ newest: scheduleEvent(amethystPrivate), reach: reachAll });

    const res = await service.updateObserverSchedule((d) =>
      tasks.setSimpleSchedule(d, { time: "25:00", days: ["mon"] }, "UTC", NOW),
    );

    expect(res.success).toBe(false);
    expect(signAs).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});

describe("editing", () => {
  it("writes nothing when an Auckland viewer confirms a New York schedule as shown", async () => {
    const before = scheduleEvent(
      amethystPrivate.map((t) => (t[0] === "cron" ? ["cron", "0 6 * * 1-5", "America/New_York", "1794300000"] : t)),
    );
    requestNewestWithReach.mockResolvedValue({
      newest: before,
      reach: reachAll,
      sentBy: { [before.id]: reachAll.answered },
    });
    const shown = { time: "00:00", days: ["tue", "wed", "thu", "fri", "sat"] as Weekday[] };

    const res = await service.updateObserverSchedule((d) =>
      tasks.editSimpleSchedule(d, shown, "Pacific/Auckland", NOW),
    );

    expect(res).toMatchObject({ success: true });
    expect(res.id).toBeUndefined();
    expect(signAs).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("keeps every tag it didn't change, on its side, and puts the private ones in ciphertext", async () => {
    const before = scheduleEvent(amethystPrivate);
    requestNewestWithReach.mockResolvedValue({ newest: before, reach: reachAll });

    const res = await service.updateObserverSchedule((d) =>
      tasks.setSimpleSchedule(d, { time: "07:30", days: ["mon", "wed"] }, "Europe/Lisbon", NOW),
    );

    expect(res.success).toBe(true);
    expect(published().kind).toBe(34817);
    expect(published().tags).toEqual([["d", "observer"]]);
    expect(published().content).not.toContain("Desktop");
    // claim, ran and the option: as Amethyst wrote them, in place.
    expect(decrypted()).toEqual([
      ["task", "observer"],
      ["cron", "30 7 * * 1,3", "Europe/Lisbon", String(NOW / 1000)],
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
      tasks.setEnabled(
        tasks.setSimpleSchedule(d, { time: "07:00", days: [...tasks.WEEKDAYS] }, "UTC", NOW),
        false,
        NOW,
      ),
    );

    // The cron it found public stays public; paused, new, goes private.
    expect(published().tags).toEqual([
      ["d", "observer"],
      ["cron", "0 7 * * *", "UTC", String(NOW / 1000)],
      ["future", "x"],
    ]);
    expect(decrypted()).toEqual([["task", "observer"], ["claim", "1794398400", "3f1c", "Desktop (Linux)"], ["paused"]]);
  });

  it("drops a public client tag Amethyst used to add, and keeps the rest where it was", async () => {
    const before = scheduleEvent(amethystPrivate, 2_000_000_000, [
      ["d", "observer"],
      ["client", "Amethyst"],
      ["future", "x"],
    ]);
    requestNewestWithReach.mockResolvedValue({ newest: before, reach: reachAll });

    const res = await service.updateObserverSchedule((d) => tasks.setEnabled(d, false, NOW));

    expect(res.success).toBe(true);
    expect(published().tags).toEqual([
      ["d", "observer"],
      ["future", "x"],
    ]);
    expect(decrypted()).toEqual([...amethystPrivate, ["paused"]]);
    expect(res.doc?.public).toEqual([["future", "x"]]);
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

    const res = await service.updateObserverSchedule((d) => tasks.setEnabled(d, false, NOW));

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

    await service.updateObserverSchedule((d) => tasks.setEnabled(d, false, NOW));

    expect(decrypted()).toContainEqual(["cron", "0 6 * * 1,3", "America/New_York"]);
    expect(published().created_at).toBe(newer.created_at + 1);
  });

  it("starts a new schedule when the relays answered and none holds one", async () => {
    requestNewestWithReach.mockResolvedValue({ newest: undefined, reach: reachAll });

    const res = await service.updateObserverSchedule((d) =>
      tasks.setSimpleSchedule(
        d,
        { time: "06:00", days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] },
        "UTC",
        NOW,
      ),
    );

    expect(res.success).toBe(true);
    expect(decrypted()).toEqual([["task", "observer"], ["paused"], ["cron", "0 6 * * *", "UTC", String(NOW / 1000)]]);
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

describe("NIP-FB's quorum: the user's write relays and nothing else", () => {
  it("asks only the write relays, so fallback relays answering can't stand in for them", async () => {
    // A reviewer's repro: w1 and w2 are down; our fallback set answers EOSE with nothing.
    // Counted in, those answers made "no event" look like "no task", and a blank
    // `0 6 * * *` task went out over the real one.
    requestNewestWithReach.mockImplementation(async (relays: string[]) => ({
      newest: undefined,
      reach: { asked: relays, answered: relays.filter((r) => r === "wss://fallback") },
    }));

    const res = await service.updateObserverSchedule((d) => tasks.setEnabled(d, true, NOW));

    expect(requestNewestWithReach.mock.calls[0][0]).toEqual(["wss://r0/", "wss://r1/"]);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/0 of your 2 write relays answered/);
    expect(signAs).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("refuses without a relay list, or with one naming no write relay", async () => {
    for (const list of [null, { write: [], read: ["wss://r0"] }]) {
      relayListIs(list);
      const res = await service.updateObserverSchedule((d) => tasks.setEnabled(d, false, NOW));
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/no write relays/);
    }
    expect(requestNewestWithReach).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("publishes to the write relays only, and needs more than half of them to take it", async () => {
    relayListIs({ write: ["wss://r0", "wss://r1", "wss://r2"], read: [] });
    requestNewestWithReach.mockImplementation(async (relays: string[]) => ({
      newest: scheduleEvent(amethystPrivate),
      reach: { asked: relays, answered: relays.slice(0, 2) },
    }));
    publish.mockImplementation(async ([url]: string[]) => [
      { ok: url !== "wss://r2/" && url !== "wss://r1/", from: url },
    ]);

    const res = await service.updateObserverSchedule((d) => tasks.setEnabled(d, false, NOW));

    expect(publish.mock.calls.map((c) => c[0][0]).sort()).toEqual(["wss://r0/", "wss://r1/", "wss://r2/"]);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Only 1 of your 3 write relays took the change/);
    // A write the reader is told failed doesn't show as saved.
    expect(store.eventStore.getReplaceable(34817, PUBKEY, "observer")?.id).not.toBe(published().id);
  });

  it("says which event it wrote, so the card can wait for it", async () => {
    requestNewestWithReach.mockResolvedValue({ newest: scheduleEvent(amethystPrivate), reach: reachAll });
    const res = await service.updateObserverSchedule((d) => tasks.setEnabled(d, false, NOW));
    expect(res.success).toBe(true);
    expect(res.id).toBe((published() as unknown as { id: string }).id);
    expect(res.createdAt).toBe(published().created_at);
    expect(store.eventStore.getReplaceable(34817, PUBKEY, "observer")?.id).toBe(res.id);
  });
});

describe("reading the schedule", () => {
  it("decrypts an event once, however many ask while it is out", async () => {
    const decrypt = vi.fn(account.nip44.decrypt);
    const slow = { ...account, nip44: { ...account.nip44, decrypt } };
    const event = scheduleEvent(amethystPrivate);
    const [a, b] = await Promise.all([
      service.readSchedule(slow as never, event),
      service.readSchedule(slow as never, event),
    ]);
    const c = await service.readSchedule(slow as never, event);
    expect(a).toEqual(b);
    expect(c).toEqual(a);
    expect(a.status).toBe("ready");
    expect(decrypt).toHaveBeenCalledTimes(1);
  });

  it("tells a signer that failed from a schedule that can't be read, and asks again only after a failure", async () => {
    let fail = true;
    const decrypt = vi.fn(async (from: string, cipher: string) => {
      if (fail) throw new Error("bunker went quiet");
      return account.nip44.decrypt(from, cipher);
    });
    const bunker = { ...account, nip44: { ...account.nip44, decrypt } };
    const event = scheduleEvent(amethystPrivate);
    expect((await service.readSchedule(bunker as never, event)).status).toBe("failed");
    fail = false;
    expect((await service.readSchedule(bunker as never, event)).status).toBe("ready");
    expect(decrypt).toHaveBeenCalledTimes(2);

    // Plaintext that isn't a tag array is unreadable, and stays so without asking again.
    const odd = scheduleEvent('{"task":"observer"}');
    expect((await service.readSchedule(bunker as never, odd)).status).toBe("unreadable");
    expect((await service.readSchedule(bunker as never, odd)).status).toBe("unreadable");
    expect(decrypt).toHaveBeenCalledTimes(3);
  });

  it("reports a signer failure when an edit needs to read the schedule", async () => {
    activeAccount.mockReturnValue({
      ...account,
      nip44: { ...account.nip44, decrypt: async () => Promise.reject(new Error("User rejected")) },
    });
    requestNewestWithReach.mockResolvedValue({ newest: scheduleEvent(amethystPrivate), reach: reachAll });
    const res = await service.updateObserverSchedule((d) => tasks.setEnabled(d, false, NOW));
    expect(res.success).toBe(false);
    expect(res.error).not.toMatch(/Couldn't read your schedule/);
    expect(publish).not.toHaveBeenCalled();
  });
});

describe("a retry after a write most relays didn't take (audit, 2026-11-12)", () => {
  const relays = ["wss://r0/", "wss://r1/", "wss://r2/"];
  const all = { asked: relays, answered: relays };
  const old = () =>
    scheduleEvent(
      [
        ["task", "observer"],
        ["cron", "0 6 * * *", "UTC", "1"],
      ],
      2_000_000_000,
    );
  const sevenAm = (d: import("@/lib/scheduledTasks").TaskTags) =>
    tasks.editSimpleSchedule(d, { time: "07:00", days: [...tasks.WEEKDAYS] }, "UTC", NOW);
  const onlyR0 = async ([url]: string[]) => [
    { ok: url === "wss://r0/", from: url, message: url === "wss://r0/" ? "" : "blocked" },
  ];

  beforeEach(() => {
    relayListIs({ write: ["wss://r0", "wss://r1", "wss://r2"], read: [] });
  });

  /** The first save: read on all three, taken by r0 alone. Returns the event it wrote. */
  async function minorityWrite() {
    const first = old();
    requestNewestWithReach.mockResolvedValueOnce({ newest: first, reach: all, sentBy: { [first.id]: relays } });
    publish.mockImplementation(onlyR0);
    const res = await service.updateObserverSchedule(sevenAm);
    expect(res.success).toBe(false);
    const wrote = publish.mock.calls[0][1] as import("nostr-tools").NostrEvent;
    publish.mockClear();
    signAs.mockClear();
    return wrote;
  }

  it("republishes the copy r0 holds to the relays missing it, unchanged, and says so only once most hold it", async () => {
    const wrote = await minorityWrite();
    // The retry reads r0's copy as newest; the edit is then no change.
    requestNewestWithReach.mockResolvedValueOnce({ newest: wrote, reach: all, sentBy: { [wrote.id]: ["wss://r0/"] } });
    publish.mockResolvedValue([{ ok: true, from: "x", message: "" }]);

    const res = await service.updateObserverSchedule(sevenAm);

    expect(signAs).not.toHaveBeenCalled();
    expect(publish.mock.calls.map((c) => c[0][0]).sort()).toEqual(["wss://r1/", "wss://r2/"]);
    expect(publish.mock.calls.every((c) => (c[1] as { id: string }).id === wrote.id)).toBe(true);
    // r0 held it, and one more took it: most of the three.
    expect(res).toMatchObject({ success: true, accepted: 2, total: 3, id: wrote.id });
  });

  it("fails, honestly, when the relays missing it still don't take it", async () => {
    const wrote = await minorityWrite();
    requestNewestWithReach.mockResolvedValueOnce({ newest: wrote, reach: all, sentBy: { [wrote.id]: ["wss://r0/"] } });
    publish.mockImplementation(onlyR0);

    const res = await service.updateObserverSchedule(sevenAm);

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/1 of your 3 write relays/);
    expect(res.retryable).toBe(true);
  });

  it("publishes nothing when the copy is already on most of them", async () => {
    const event = old();
    requestNewestWithReach.mockResolvedValueOnce({
      newest: event,
      reach: all,
      sentBy: { [event.id]: ["wss://r0/", "wss://r1/"] },
    });
    const res = await service.updateObserverSchedule((d) => d);
    expect(res.success).toBe(true);
    expect(publish).not.toHaveBeenCalled();
  });

  it("pausing a schedule another device already paused signs and publishes nothing", async () => {
    const paused = scheduleEvent([["task", "observer"], ["cron", "0 6 * * *", "UTC", "1"], ["paused"]]);
    requestNewestWithReach.mockResolvedValueOnce({ newest: paused, reach: all, sentBy: { [paused.id]: relays } });
    const res = await service.updateObserverSchedule((d) => tasks.setEnabled(d, false, NOW));
    expect(res.success).toBe(true);
    expect(signAs).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});

describe("a relay list that couldn't be loaded is not one with no write relays (audit, 2026-11-12)", () => {
  it("says it couldn't load the list, and that a retry may work", async () => {
    loadFreshRelayList.mockResolvedValue({ status: "unavailable" });
    const res = await service.updateObserverSchedule((d) => tasks.setEnabled(d, false, NOW));
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Couldn't load your relay list/);
    expect(res.error).not.toMatch(/no write relays/);
    expect(res.retryable).toBe(true);
    expect(requestNewestWithReach).not.toHaveBeenCalled();
  });

  it("says there are no write relays only when the list says so", async () => {
    relayListIs(null);
    const res = await service.updateObserverSchedule((d) => tasks.setEnabled(d, false, NOW));
    expect(res.error).toMatch(/no write relays/);
    expect(res.retryable).toBeFalsy();
  });
});

describe("loading the schedule records when the relays answered (audit, 2026-11-12)", () => {
  it("only when most of the write relays reached EOSE, never on a timeout", async () => {
    expect(service.scheduleCheckedAt(PUBKEY)).toBeNull();
    // Every relay silent: the read times out with nothing.
    requestNewestWithReach.mockImplementation(async (relays: string[]) => ({
      newest: undefined,
      reach: { asked: relays, answered: [] },
      sentBy: {},
    }));
    await service.loadObserverSchedule(PUBKEY);
    expect(service.scheduleCheckedAt(PUBKEY)).toBeNull();
    // The profile floor answering doesn't stand in for the write relays.
    requestNewestWithReach.mockImplementation(async (relays: string[]) => ({
      newest: undefined,
      reach: { asked: relays, answered: relays.filter((r) => !r.startsWith("wss://r")) },
      sentBy: {},
    }));
    await service.loadObserverSchedule(PUBKEY);
    expect(service.scheduleCheckedAt(PUBKEY)).toBeNull();
    // Both write relays answered.
    requestNewestWithReach.mockImplementation(async (relays: string[]) => ({
      newest: undefined,
      reach: { asked: relays, answered: relays },
      sentBy: {},
    }));
    const before = Date.now();
    await service.loadObserverSchedule(PUBKEY);
    expect(service.scheduleCheckedAt(PUBKEY)).toBeGreaterThanOrEqual(before);
    expect(requestNewestWithReach.mock.calls[0][0]).toEqual(expect.arrayContaining(["wss://r0/", "wss://r1/"]));
  });
});

describe("a key that can't be unlocked here is a failure to retry (audit, 2026-11-12)", () => {
  it("isn't remembered as unreadable for the session", async () => {
    const { NoUnlockPathError } = await import("@/accounts/local-signer");
    const ev = scheduleEvent(amethystPrivate);
    const { LocalAccount } = await import("@/accounts/local-account");
    // A key held here (not an extension or bunker) whose unlock has no way through.
    const stuck = Object.setPrototypeOf(
      { ...account, nip44: { ...account.nip44, decrypt: async () => Promise.reject(new NoUnlockPathError()) } },
      LocalAccount.prototype,
    );
    expect(await service.readSchedule(stuck as never, ev)).toMatchObject({ status: "failed" });
    expect(service.heldSchedule(ev.id)).toBeUndefined();
    expect(await service.readSchedule(account as never, ev)).toMatchObject({ status: "ready" });
  });
});

describe("the runner: params and the Assistant (NIP-FB `param`, Runner)", () => {
  // The Assistant's own key pair: what brainstorm_server holds for this reader.
  const ASSISTANT_SECRET = new Uint8Array(32).fill(9);
  const ASSISTANT = getPublicKey(ASSISTANT_SECRET);
  const OTHER = getPublicKey(new Uint8Array(32).fill(11));
  /** What the Assistant reads: the reader is its peer. */
  const assistantReads = (content: string) =>
    JSON.parse(nip44.decrypt(content, nip44.getConversationKey(ASSISTANT_SECRET, PUBKEY))) as string[][];
  const withParams = [
    ...amethystPrivate,
    ["param", "model", "anthropic/claude-sonnet-4.5"],
    ["param", "key", "https://openrouter.ai/api/v1", "a3f9"],
    ["param", "size", "a3"],
  ];
  /** `withParams` once naming or clearing the runner marked `cron` as set at NOW. */
  const restamped = withParams.map((t) => (t[0] === "cron" ? [...t, String(NOW / 1000)] : t));
  const toAssistant = (
    tags: string[][],
    createdAt = 2_000_000_000,
    publicTags: string[][] = [
      ["d", "observer"],
      ["p", ASSISTANT],
    ],
  ) =>
    finalizeEvent(
      {
        kind: 34817,
        created_at: createdAt,
        tags: publicTags,
        content: nip44.encrypt(JSON.stringify(tags), nip44.getConversationKey(SECRET, ASSISTANT)),
      },
      SECRET,
    );

  it("naming the Assistant adds the public p and re-encrypts so both read it, every param kept", async () => {
    requestNewestWithReach.mockResolvedValue({ newest: scheduleEvent(withParams), reach: reachAll });

    const res = await service.updateObserverSchedule((d) => tasks.setRunner(d, ASSISTANT, NOW));

    expect(res.success).toBe(true);
    const event = published();
    expect(event.tags).toEqual([
      ["d", "observer"],
      ["p", ASSISTANT],
    ]);
    // The Assistant reads it with the reader as peer; the reader with the Assistant as peer.
    expect(assistantReads(event.content)).toEqual(restamped);
    expect(() => nip44.decrypt(event.content, toSelf)).toThrow();
    const read = await service.readSchedule(account as never, event as never);
    expect(read).toEqual({ status: "ready", tags: { public: [["p", ASSISTANT]], private: restamped } });
  });

  it("reads an event encrypted to the Assistant, and choosing devices re-encrypts to self without the p", async () => {
    requestNewestWithReach.mockResolvedValue({ newest: toAssistant(withParams), reach: reachAll });

    const res = await service.updateObserverSchedule((d) => {
      expect(d.private).toEqual(withParams);
      return tasks.setRunner(d, null, NOW);
    });

    expect(res.success).toBe(true);
    expect(published().tags).toEqual([["d", "observer"]]);
    expect(decrypted()).toEqual(restamped);
    expect(() => assistantReads(published().content)).toThrow();
  });

  it("an edit while the Assistant prints stays encrypted to it, unknown params where they were", async () => {
    requestNewestWithReach.mockResolvedValue({ newest: toAssistant(withParams), reach: reachAll });

    const res = await service.updateObserverSchedule((d) => lib.withObserverModel(d, "openai/gpt-4o-mini"));

    expect(res.success).toBe(true);
    const tags = assistantReads(published().content);
    expect(tags.filter((t) => t[0] === "param")).toEqual([
      ["param", "model", "openai/gpt-4o-mini"],
      ["param", "key", "https://openrouter.ai/api/v1", "a3f9"],
      ["param", "size", "a3"],
    ]);
    expect(published().tags).toEqual([
      ["d", "observer"],
      ["p", ASSISTANT],
    ]);
  });

  it("moving to another runner re-encrypts to it, and the first one no longer reads it", async () => {
    const OTHER_SECRET = new Uint8Array(32).fill(11);
    requestNewestWithReach.mockResolvedValue({ newest: toAssistant(withParams), reach: reachAll });

    const res = await service.updateObserverSchedule((d) => tasks.setRunner(d, OTHER, NOW));

    expect(res.success).toBe(true);
    expect(published().tags).toEqual([
      ["d", "observer"],
      ["p", OTHER],
    ]);
    const otherReads = JSON.parse(nip44.decrypt(published().content, nip44.getConversationKey(OTHER_SECRET, PUBKEY)));
    expect(otherReads).toEqual(restamped);
    expect(() => assistantReads(published().content)).toThrow();
  });

  it("a conflict is read with whichever named key opens it, and written to self", async () => {
    // Two p tags: some client encrypted to the second one.
    const conflict = finalizeEvent(
      {
        kind: 34817,
        created_at: 2_000_000_000,
        tags: [
          ["d", "observer"],
          ["p", OTHER],
          ["p", ASSISTANT],
        ],
        content: nip44.encrypt(JSON.stringify(withParams), nip44.getConversationKey(SECRET, ASSISTANT)),
      },
      SECRET,
    );
    const read = await service.readSchedule(account as never, conflict as never);
    expect(read.status).toBe("ready");
    expect(tasks.readTask((read as { tags: never }).tags)).toMatchObject({ runnerConflict: true, runner: null });

    requestNewestWithReach.mockResolvedValue({ newest: conflict, reach: reachAll });
    const res = await service.updateObserverSchedule((d) => tasks.setEnabled(d, false, NOW));
    expect(res.success).toBe(true);
    // Nobody runs a conflict, and only the reader must read it.
    expect(decrypted().some((t) => t[0] === "paused")).toBe(true);
    expect(published().tags.filter((t) => t[0] === "p")).toHaveLength(2);
  });

  it("a ciphertext neither the Assistant's nor the reader's own is unreadable, and never overwritten", async () => {
    const stranger = finalizeEvent(
      {
        kind: 34817,
        created_at: 2_000_000_000,
        tags: [
          ["d", "observer"],
          ["p", ASSISTANT],
        ],
        content: nip44.encrypt("[]", nip44.getConversationKey(SECRET, OTHER)),
      },
      SECRET,
    );
    expect(await service.readSchedule(account as never, stranger as never)).toEqual({ status: "unreadable" });
    requestNewestWithReach.mockResolvedValue({ newest: stranger, reach: reachAll });
    const res = await service.updateObserverSchedule((d) => tasks.setRunner(d, null, NOW));
    expect(res.success).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });
});

describe("edits one at a time (audit, 2026-11-12)", () => {
  it("serializes two quick edits: the second reads what the first wrote, so neither is lost", async () => {
    // The relays lag: every read answers with the copy from before both edits.
    const before = scheduleEvent(amethystPrivate);
    requestNewestWithReach.mockResolvedValue({ newest: before, reach: reachAll });

    const [first, second] = await Promise.all([
      service.updateObserverSchedule((d) => lib.withObserverModel(d, "model-one")),
      service.updateObserverSchedule((d) => tasks.setEnabled(d, false, NOW)),
    ]);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    // One event per edit, each sent to both write relays.
    type Sent = { id: string; content: string; created_at: number };
    const events = [...new Map(publish.mock.calls.map((c) => [(c[1] as Sent).id, c[1] as Sent])).values()];
    expect(events).toHaveLength(2);
    const tags = JSON.parse(nip44.decrypt(events[1].content, toSelf)) as string[][];
    expect(tags).toContainEqual(["param", "model", "model-one"]);
    expect(tags).toContainEqual(["paused"]);
    expect(events[1].created_at).toBeGreaterThan(events[0].created_at);
  });

  it("a failed edit doesn't stop the next one", async () => {
    requestNewestWithReach
      .mockResolvedValueOnce({ newest: undefined, reach: reachNone })
      .mockResolvedValue({ newest: scheduleEvent(amethystPrivate), reach: reachAll });

    const [first, second] = await Promise.all([
      service.updateObserverSchedule((d) => tasks.setEnabled(d, false, NOW)),
      service.updateObserverSchedule((d) => tasks.setEnabled(d, false, NOW)),
    ]);

    expect(first.success).toBe(false);
    expect(second.success).toBe(true);
  });
});
