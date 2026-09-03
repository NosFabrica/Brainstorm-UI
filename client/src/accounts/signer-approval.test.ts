// @vitest-environment node
import { describe, expect, it } from "vitest";

import { requestSignerApproval, signerApproval$ } from "./signer-approval";

describe("an auth_url from a signer", () => {
  it("puts the link on screen instead of opening a window nobody asked for", async () => {
    const waiting = requestSignerApproval("https://use.nsec.app/key/npub1?confirm-connect=true");

    expect(signerApproval$.value?.url).toBe("https://use.nsec.app/key/npub1?confirm-connect=true");
    signerApproval$.value!.opened();
    await waiting;
    expect(signerApproval$.value).toBeNull();
  });

  it("resolves on a dismiss rather than rejecting", async () => {
    // applesauce rejects the pending request if onAuth throws, which would
    // abandon a request the user may be approving in their signer right now.
    const waiting = requestSignerApproval("https://example.test/approve");
    signerApproval$.value!.dismiss();
    await expect(waiting).resolves.toBeUndefined();
  });

  it("holds nothing once it's answered, so a late mount shows no stale prompt", async () => {
    const waiting = requestSignerApproval("https://example.test/approve");
    signerApproval$.value!.opened();
    await waiting;
    expect(signerApproval$.value).toBeNull();
  });
});
