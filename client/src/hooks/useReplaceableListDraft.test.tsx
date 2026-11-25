// @vitest-environment jsdom
/**
 * A draft of a replaceable list: no edits before the list is read, "couldn't
 * read it" never taken for "there is none", an untouched draft moving onto a
 * newer version, a touched one refusing to publish over it, and a publish
 * stamped past the newest version.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import type { ReplaceableProbe } from "@/lib/replaceableDraft";

const probes = vi.hoisted(() => ({ next: [] as (() => Promise<ReplaceableProbe>)[], calls: 0 }));
vi.mock("@/lib/replaceableDraft", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/replaceableDraft")>()),
  probeReplaceable: () => {
    probes.calls++;
    const next = probes.next.length > 1 ? probes.next.shift()! : probes.next[0];
    return next ? next() : Promise.resolve({ event: undefined, provenAbsent: true });
  },
}));

import { NEWER_VERSION_ARRIVED, LIST_NOT_READ } from "@/lib/replaceableDraft";
import { useReplaceableListDraft } from "./useReplaceableListDraft";

const KIND = 10050;
let me = "";
let n = 0;
const version = (relays: string[], created_at: number, pubkey = me): NostrEvent =>
  ({
    id: (++n).toString(16).padStart(64, "0"),
    kind: KIND,
    pubkey,
    created_at,
    content: "",
    sig: "s",
    tags: relays.map((r) => ["relay", r]),
  }) as NostrEvent;
const read = (ev: NostrEvent | null) => (ev?.tags ?? []).map((t) => t[1]);
const answered =
  (event?: NostrEvent): (() => Promise<ReplaceableProbe>) =>
  () =>
    Promise.resolve({ event, provenAbsent: !event });
const silent: () => Promise<ReplaceableProbe> = () => Promise.resolve({ event: undefined, provenAbsent: false });

const realVerify = eventStore.verifyEvent;
beforeAll(() => {
  eventStore.verifyEvent = undefined;
});
afterAll(() => {
  eventStore.verifyEvent = realVerify;
});
beforeEach(() => {
  // A fresh author per test: the store is shared across them.
  me = (++n).toString(16).padStart(64, "a");
  probes.next = [];
  probes.calls = 0;
});

const draftOf = () => renderHook(() => useReplaceableListDraft(KIND, me, undefined, { read }));

describe("useReplaceableListDraft", () => {
  it("refuses edits until the list is read, and starts them from what was read", async () => {
    let answer!: (p: ReplaceableProbe) => void;
    const current = version(["wss://a"], 100);
    probes.next = [() => new Promise((r) => (answer = r))];
    const { result } = draftOf();

    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(probes.calls).toBe(1));
    act(() => result.current.edit((v) => [...v, "wss://new"]));
    expect(result.current.dirty).toBe(false);

    await act(async () => {
      eventStore.add(current);
      answer({ event: current, provenAbsent: false });
    });
    expect(result.current.status).toBe("ready");
    act(() => result.current.edit((v) => [...v, "wss://new"]));
    expect(result.current.value).toEqual(["wss://a", "wss://new"]);
  });

  it("calls a read nobody answered unreadable, not empty, and won't publish on it", async () => {
    probes.next = [silent];
    const { result } = draftOf();
    await waitFor(() => expect(result.current.status).toBe("unreadable"));
    expect(result.current.canEdit).toBe(false);

    const send = vi.fn(async () => ({ success: true }));
    const res = await act(() => result.current.publish(send));
    expect(res).toEqual({ success: false, error: LIST_NOT_READ });
    expect(send).not.toHaveBeenCalled();
  });

  it("is ready on an empty list once the relays prove there is none", async () => {
    probes.next = [answered()];
    const { result } = draftOf();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.value).toEqual([]);
  });

  it("moves an untouched draft onto a newer version as it arrives", async () => {
    const first = version(["wss://a"], 100);
    eventStore.add(first);
    probes.next = [answered(first)];
    const { result } = draftOf();
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => {
      eventStore.add(version(["wss://a", "wss://b"], 200));
    });
    await waitFor(() => expect(result.current.value).toEqual(["wss://a", "wss://b"]));
    expect(result.current.stale).toBe(false);
  });

  it("blocks a touched draft from publishing over a newer version", async () => {
    const first = version(["wss://a"], 100);
    eventStore.add(first);
    probes.next = [answered(first)];
    const { result } = draftOf();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.edit((v) => [...v, "wss://mine"]));

    act(() => {
      eventStore.add(version(["wss://a", "wss://theirs"], 200));
    });
    await waitFor(() => expect(result.current.stale).toBe(true));
    const send = vi.fn(async () => ({ success: true }));
    expect(await act(() => result.current.publish(send))).toEqual({ success: false, error: NEWER_VERSION_ARRIVED });
    expect(send).not.toHaveBeenCalled();

    act(() => result.current.discard());
    expect(result.current.value).toEqual(["wss://a", "wss://theirs"]);
    expect(result.current.stale).toBe(false);
  });

  it("reads once more before publishing, and refuses when a newer version is out there", async () => {
    const first = version(["wss://a"], 100);
    eventStore.add(first);
    const newer = version(["wss://a", "wss://theirs"], 200);
    probes.next = [answered(first), answered(newer)];
    const { result } = draftOf();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.edit((v) => [...v, "wss://mine"]));

    const send = vi.fn(async () => ({ success: true }));
    expect(await act(() => result.current.publish(send))).toEqual({ success: false, error: NEWER_VERSION_ARRIVED });
    expect(send).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.stale).toBe(true));
  });

  it("publishes past the newest version, then follows what it published", async () => {
    const first = version(["wss://a"], 2_000_000_000);
    eventStore.add(first);
    probes.next = [answered(first)];
    const { result } = draftOf();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.edit((v) => [...v, "wss://mine"]));

    const send = vi.fn(async (value: string[], ctx: { base: NostrEvent | null; createdAt: number }) => ({
      success: true,
      event: version(value, ctx.createdAt),
    }));
    await act(() => result.current.publish(send));
    expect(send).toHaveBeenCalledWith(["wss://a", "wss://mine"], { base: first, createdAt: 2_000_000_001 });
    expect(result.current.dirty).toBe(false);
    expect(result.current.value).toEqual(["wss://a", "wss://mine"]);
  });

  it("never takes another author's list for this one", async () => {
    const theirs = version(["wss://theirs"], 300, "f".repeat(64));
    probes.next = [answered(theirs)];
    const { result } = renderHook(() => useReplaceableListDraft(KIND, me, undefined, { read, held: theirs }));
    await waitFor(() => expect(result.current.status).not.toBe("loading"));
    expect(result.current.latest).toBeNull();
    expect(result.current.value).toEqual([]);
  });
});
