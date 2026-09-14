// @vitest-environment jsdom
/**
 * Going to an event, on Nostr. Benjamin: "I don't want this to go to Google
 * — keep it Nostr." A NIP-52 RSVP (kind 31925) under the reader's own key:
 * addressable, naming the event's coordinate and id, status accepted. Other
 * clients understand it, and it is how Brainstorm remembers you're going.
 * Withdrawal is the same NIP-09 delete the vouch uses.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Observable, Subject } from "rxjs";
import type { NostrEvent } from "nostr-tools";

const ME = "e".repeat(64);
const HOST = "f".repeat(64);
let account: { pubkey: string } | undefined = { pubkey: ME };
const signAsMock = vi.fn(async (_acct: unknown, template: Record<string, unknown>) => ({ ...template, id: "signed-id", pubkey: ME, sig: "sig", created_at: 1 }));
vi.mock("@/accounts/signing", () => ({
  activeAccount: () => account,
  signAs: (acct: unknown, template: Record<string, unknown>) => signAsMock(acct, template),
  signingFailure: (e: unknown) => ({ success: false, error: e instanceof Error ? e.message : "Signing failed" }),
}));
const publishMock = vi.fn(async () => ({ success: true }));
vi.mock("@/services/nostr", () => ({ publishToRelays: (...a: unknown[]) => publishMock(...(a as [])) }));
let searchSubject: Subject<{ type: string; event?: NostrEvent }> | null = null;
const searchReqMock = vi.fn((_filter: unknown) => {
  searchSubject = new Subject();
  return new Observable((subscriber) => {
    const inner = searchSubject!.subscribe(subscriber);
    return () => inner.unsubscribe();
  });
});
vi.mock("@/lib/searchRelay", () => ({ searchRelay: () => ({ req: (f: unknown) => searchReqMock(f) }) }));

import { __resetRsvpCache, fetchMyRsvp, publishRsvp, withdrawRsvp } from "./rsvp";

const meetup = {
  id: "1".repeat(64),
  kind: 31923,
  pubkey: HOST,
  created_at: 1_760_000_000,
  content: "",
  sig: "",
  tags: [["d", "north-chicago-sep"], ["title", "North Chicago Bitcoin Meetup"], ["start", "1760400000"]],
};

beforeEach(() => {
  vi.clearAllMocks();
  __resetRsvpCache();
  account = { pubkey: ME };
  publishMock.mockResolvedValue({ success: true });
  searchSubject = null;
});

describe("publishRsvp", () => {
  it("signs a NIP-52 RSVP that names the event by coordinate and id", async () => {
    const res = await publishRsvp(meetup);
    expect(res.success).toBe(true);
    const template = signAsMock.mock.calls[0][1] as { kind: number; tags: string[][]; content: string };
    expect(template.kind).toBe(31925);
    const tag = (k: string) => template.tags.find((t) => t[0] === k);
    expect(tag("a")).toEqual(["a", `31923:${HOST}:north-chicago-sep`]);
    expect(tag("e")).toEqual(["e", meetup.id]);
    expect(tag("status")).toEqual(["status", "accepted"]);
    expect(tag("p")).toEqual(["p", HOST]);
    expect(tag("d")?.[1]).toMatch(/^[\w-]{8,}$/);
    expect(template.tags).toEqual(expect.arrayContaining([["client", "Brainstorm"]]));
    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(res.event).toMatchObject({ id: "signed-id", kind: 31925 });
  });

  it("refuses a signed-out reader and the event's own host, without touching the signer", async () => {
    account = undefined;
    expect(await publishRsvp(meetup)).toMatchObject({ success: false, error: /log/i });
    account = { pubkey: HOST };
    expect(await publishRsvp(meetup)).toMatchObject({ success: false, error: /your own event/i });
    expect(signAsMock).not.toHaveBeenCalled();
  });
});

describe("withdrawRsvp", () => {
  it("deletes the RSVP by id and coordinate so relays drop every version", async () => {
    const res = await withdrawRsvp({ id: "rsvp-id", d: "abc123" });
    expect(res.success).toBe(true);
    const template = signAsMock.mock.calls[0][1] as { kind: number; tags: string[][] };
    expect(template.kind).toBe(5);
    expect(template.tags).toEqual(expect.arrayContaining([["e", "rsvp-id"], ["a", `31925:${ME}:abc123`], ["k", "31925"]]));
  });
});

describe("fetchMyRsvp", () => {
  it("asks the search relay for my RSVP to this event and returns the newest", async () => {
    const p = fetchMyRsvp(meetup, ME);
    await vi.waitFor(() => expect(searchReqMock).toHaveBeenCalledTimes(1));
    expect(searchReqMock.mock.calls[0][0]).toMatchObject({ kinds: [31925], authors: [ME], "#a": [`31923:${HOST}:north-chicago-sep`], search: "include:spam" });
    const rsvp = (id: string, status: string, created_at: number, d: string): NostrEvent =>
      ({ id, kind: 31925, pubkey: ME, created_at, content: "", sig: "", tags: [["a", `31923:${HOST}:north-chicago-sep`], ["d", d], ["status", status]] }) as NostrEvent;
    searchSubject!.next({ type: "EVENT", event: rsvp("old", "tentative", 100, "d1") });
    searchSubject!.next({ type: "EVENT", event: rsvp("new", "accepted", 200, "d2") });
    searchSubject!.next({ type: "EOSE" });
    expect(await p).toEqual({ id: "new", d: "d2", status: "accepted" });
  });

  it("is null when I never answered", async () => {
    const p = fetchMyRsvp(meetup, ME);
    await vi.waitFor(() => expect(searchReqMock).toHaveBeenCalledTimes(1));
    searchSubject!.next({ type: "EOSE" });
    expect(await p).toBeNull();
  });
});
