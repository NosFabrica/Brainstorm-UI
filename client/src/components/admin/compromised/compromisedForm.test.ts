import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import { EMPTY_FORM, buildMarkRequest, parseAccount, zeroState, zeroSummary } from "./compromisedForm";
import type { CompromisedPubkey } from "@/services/api";

const PK = "3f770d65d3a764a9c5cb503ae123e62ec7598ad035d836e2a810f3877a745b24";
const NPUB = "npub18ams6ewn5aj2n3wt2qawzglx9mr4nzksxhvrdc4gzrecw7n5tvjqctp424";
const NEXT = "b".repeat(64);
const NEVENT = nip19.neventEncode({ id: "0".repeat(64) });

describe("parseAccount", () => {
  it("takes an npub, an nprofile or hex", () => {
    expect(parseAccount(NPUB)).toBe(PK);
    expect(parseAccount(` ${PK.toUpperCase()} `)).toBe(PK);
    expect(parseAccount(nip19.nprofileEncode({ pubkey: PK }))).toBe(PK);
    expect(parseAccount("npub1nope")).toBeNull();
    expect(parseAccount(NEVENT)).toBeNull();
  });
});

describe("buildMarkRequest", () => {
  it("sends a proof pointer as typed, so an nevent keeps its hints", () => {
    const req = buildMarkRequest({ ...EMPTY_FORM, account: NPUB, proofId: ` ${NEVENT} `, reason: " leak " });
    expect(req).toEqual({ pubkey: PK, body: { proof_event_id: NEVENT, reason: "leak" } });
  });

  it("sends a pasted event whole", () => {
    const event = { id: "1".repeat(64), pubkey: PK, sig: "s", kind: 1, tags: [], content: "stolen", created_at: 1 };
    const req = buildMarkRequest({ ...EMPTY_FORM, account: PK, proofMode: "json", proofJson: JSON.stringify(event) });
    expect(req).toEqual({ pubkey: PK, body: { proof_event: event } });
  });

  it("adds the successor as hex", () => {
    const req = buildMarkRequest({ ...EMPTY_FORM, account: PK, proofId: NEVENT, successor: nip19.npubEncode(NEXT) });
    expect(req).toMatchObject({ body: { successor_pubkey: NEXT } });
  });

  it("names the first thing wrong", () => {
    expect(buildMarkRequest({ ...EMPTY_FORM, account: "x", proofId: NEVENT }).error).toMatch(/account/);
    expect(buildMarkRequest({ ...EMPTY_FORM, account: PK, proofId: "nope" }).error).toMatch(/proof/);
    expect(buildMarkRequest({ ...EMPTY_FORM, account: PK, proofMode: "json", proofJson: "{" }).error).toMatch(/JSON/);
    expect(buildMarkRequest({ ...EMPTY_FORM, account: PK, proofMode: "json", proofJson: "{}" }).error).toMatch(/sig/);
    expect(buildMarkRequest({ ...EMPTY_FORM, account: PK, proofId: NEVENT, successor: "x" }).error).toMatch(
      /new account/,
    );
    expect(buildMarkRequest({ ...EMPTY_FORM, account: PK, proofId: NEVENT, successor: NPUB }).error).toMatch(
      /can't be/,
    );
  });
});

function row(patch: Partial<CompromisedPubkey>): CompromisedPubkey {
  return {
    pubkey: PK,
    proof_event_id: "x",
    proof_event: { id: "x", pubkey: PK, created_at: 1, kind: 1, tags: [], content: "", sig: "s" },
    successor_pubkey: null,
    reason: null,
    added_by: null,
    created_at: "2026-11-16T17:00:00",
    updated_at: "2026-11-16T17:00:00",
    last_zeroed_at: null,
    last_zero_report: null,
    ...patch,
  };
}

const DONE = {
  observers: 3,
  relay_read: true,
  published: 3,
  acked: 3,
  complete: true,
  neo4j_cleared: 6,
  whitelists_updated: 2,
  edges_cut: 40,
};

describe("zeroState", () => {
  it("is pending until a zeroing lands after the last PUT", () => {
    expect(zeroState(row({}))).toBe("pending");
    expect(
      zeroState(
        row({ updated_at: "2026-11-16T18:00:00", last_zeroed_at: "2026-11-16T17:01:00", last_zero_report: DONE }),
      ),
    ).toBe("pending");
  });

  it("keys on when a zeroing was asked for, so a metadata edit isn't pending", () => {
    const zeroed = { last_zeroed_at: "2026-11-16T17:01:00", last_zero_report: DONE };
    // Edited (updated_at later) but no zeroing asked for since: settled.
    expect(
      zeroState(row({ ...zeroed, updated_at: "2026-11-16T18:00:00", zero_requested_at: "2026-11-16T17:00:00" })),
    ).toBe("complete");
    // Asked again after the last report: pending.
    expect(zeroState(row({ ...zeroed, zero_requested_at: "2026-11-16T17:30:00" }))).toBe("pending");
  });

  it("reads the report once it has", () => {
    const at = { last_zeroed_at: "2026-11-16T17:01:00" };
    expect(zeroState(row({ ...at, last_zero_report: DONE }))).toBe("complete");
    expect(zeroState(row({ ...at, last_zero_report: { ...DONE, complete: false } }))).toBe("incomplete");
    expect(zeroState(row({ ...at, last_zero_report: { ...DONE, relay_read: false } }))).toBe("incomplete");
    expect(zeroState(row({ ...at, last_zero_report: { error: "RuntimeError('x')" } }))).toBe("failed");
  });

  it("summarises what the zeroing did", () => {
    const summary = zeroSummary(row({ last_zeroed_at: "2026-11-16T17:01:00", last_zero_report: DONE }));
    expect(summary).toContain("3/3 Observers");
    expect(summary).toContain("40 of its own ratings cut");
  });
});
