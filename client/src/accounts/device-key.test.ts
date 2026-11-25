// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { dropDeviceKeyIfUnneeded, holdDeviceKey } from "./device-key";

/** Web Locks across tabs, as far as shared vs exclusive with ifAvailable goes. */
function fakeLocks() {
  let shared = 0;
  let exclusive = false;
  const request = vi.fn(async (_name: string, options: LockOptions, callback: (lock: Lock | null) => unknown) => {
    if (options.mode === "exclusive") {
      if (shared || exclusive) return callback(null);
      exclusive = true;
      try {
        return await callback({ name: _name, mode: "exclusive" } as Lock);
      } finally {
        exclusive = false;
      }
    }
    shared++;
    try {
      return await callback({ name: _name, mode: "shared" } as Lock);
    } finally {
      shared--;
    }
  });
  return { request } as unknown as Pick<LockManager, "request">;
}

describe("dropping the device key", () => {
  it("drops it when no tab holds an account", async () => {
    const locks = fakeLocks();
    const drop = vi.fn(async () => {});
    holdDeviceKey(true, locks);
    await Promise.resolve();
    await expect(dropDeviceKeyIfUnneeded(() => false, { locks, drop })).resolves.toBe(true);
    expect(drop).toHaveBeenCalledTimes(1);
  });

  it("keeps it while another tab holds an account (its shared lock)", async () => {
    const locks = fakeLocks();
    const drop = vi.fn(async () => {});
    // Another tab: a lock held for as long as it has an account.
    void locks.request("brainstorm:device-key", { mode: "shared" }, () => new Promise(() => {}));
    await expect(dropDeviceKeyIfUnneeded(() => false, { locks, drop })).resolves.toBe(false);
    expect(drop).not.toHaveBeenCalled();
  });

  it("keeps it while this tab or its storage still needs it", async () => {
    const drop = vi.fn(async () => {});
    await expect(dropDeviceKeyIfUnneeded(() => true, { locks: fakeLocks(), drop })).resolves.toBe(false);
    expect(drop).not.toHaveBeenCalled();
  });

  it("does nothing without Web Locks — and so without a vault", async () => {
    const drop = vi.fn(async () => {});
    await expect(dropDeviceKeyIfUnneeded(() => false, { locks: undefined, drop })).resolves.toBe(false);
  });
});
