// @vitest-environment jsdom
/**
 * Writing a trust review: Brainstorm publishes the SAME kind-31871 vouch Relay
 * Outpost does — addressable on the subject, typed vouch | identity, s=vouched
 * — so a review written in either app shows in both. Removal is the same
 * NIP-09 delete, naming the event AND its addressable coordinate so relays
 * drop every version.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ME = "e".repeat(64);
const THEM = "f".repeat(64);
let account: { pubkey: string } | undefined = { pubkey: ME };
const signAsMock = vi.fn(async (_acct: unknown, template: Record<string, unknown>) => ({ ...template, id: "signed-id", pubkey: ME, sig: "sig" }));
vi.mock("@/accounts/signing", () => ({
  activeAccount: () => account,
  signAs: (acct: unknown, template: Record<string, unknown>) => signAsMock(acct, template),
  signingFailure: (e: unknown) => ({ success: false, error: e instanceof Error ? e.message : "Signing failed" }),
}));
const publishMock = vi.fn(async () => ({ success: true }));
vi.mock("@/services/nostr", () => ({ publishToRelays: (...a: unknown[]) => publishMock(...(a as [])) }));

import { publishVouch, revokeVouch } from "./vouches";

beforeEach(() => {
  vi.clearAllMocks();
  account = { pubkey: ME };
  publishMock.mockResolvedValue({ success: true });
});

describe("publishVouch", () => {
  it("signs and publishes Relay Outpost's exact vouch shape", async () => {
    const res = await publishVouch(THEM, { type: "identity", content: "  I know this is really them. " });
    expect(res.success).toBe(true);
    const template = signAsMock.mock.calls[0][1];
    expect(template).toMatchObject({ kind: 31871, content: "I know this is really them." });
    expect(template.tags).toEqual([
      ["d", THEM],
      ["p", THEM],
      ["t", "identity"],
      ["s", "vouched"],
      ["alt", "Trust vouch"],
      ["client", "Brainstorm"],
    ]);
    expect(publishMock).toHaveBeenCalledTimes(1);
    // The caller gets the signed event back so the page can show it at once.
    expect(res.event).toMatchObject({ id: "signed-id", pubkey: ME, kind: 31871 });
  });

  it("refuses a self-vouch and a signed-out viewer without touching the signer", async () => {
    expect((await publishVouch(ME, { type: "vouch", content: "me" })).success).toBe(false);
    account = undefined;
    expect((await publishVouch(THEM, { type: "vouch", content: "x" })).success).toBe(false);
    expect(signAsMock).not.toHaveBeenCalled();
  });
});

describe("revokeVouch", () => {
  it("publishes a NIP-09 delete naming the event and its coordinate", async () => {
    const res = await revokeVouch(THEM, "vouch-id");
    expect(res.success).toBe(true);
    const template = signAsMock.mock.calls[0][1];
    expect(template).toMatchObject({ kind: 5, content: "Vouch removed" });
    expect(template.tags).toEqual([
      ["e", "vouch-id"],
      ["a", `31871:${ME}:${THEM}`],
      ["k", "31871"],
      ["client", "Brainstorm"],
    ]);
  });
});
