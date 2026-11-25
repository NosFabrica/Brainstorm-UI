// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { notificationUrl } from "@/lib/dm/notify";
import { closeMessageNotifications } from "./DmNotifications";

const A = "a".repeat(64);
const B = "b".repeat(64);

function shown(url: string) {
  return { data: { url }, close: vi.fn() };
}

describe("closing message notifications", () => {
  // Left in the tray past a sign-out or a switch, a tap opened the chat as whoever was signed in by then.
  it("closes every account's but the one now signed in", async () => {
    const forA = shown(notificationUrl("npub1x", A));
    const forB = shown(notificationUrl("npub1y", B));
    const other = shown("/settings");
    const registration = { getNotifications: async () => [forA, forB, other] };

    await closeMessageNotifications(B, registration as never);

    expect(forA.close).toHaveBeenCalled();
    expect(forB.close).not.toHaveBeenCalled();
    expect(other.close).not.toHaveBeenCalled();
  });

  it("closes them all on sign-out", async () => {
    const forA = shown(notificationUrl("npub1x", A));
    const legacy = shown("/messages/npub1x");
    await closeMessageNotifications(undefined, { getNotifications: async () => [forA, legacy] } as never);
    expect(forA.close).toHaveBeenCalled();
    expect(legacy.close).toHaveBeenCalled();
  });
});
