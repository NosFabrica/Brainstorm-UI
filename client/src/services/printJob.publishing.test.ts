import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readTask, type TaskTags } from "@/lib/scheduledTasks";
import { forgetHeldSchedules, holdSchedule } from "@/lib/frontPage/heldSchedule";

const state = vi.hoisted(() => ({
  active: null as string | null,
  doc: { public: [], private: [["task", "observer"]] } as TaskTags,
  edits: 0,
}));

vi.mock("@/accounts/signing", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  activeAccount: () => (state.active ? { pubkey: state.active } : undefined),
}));
vi.mock("@/services/observerSchedule", () => ({
  updateObserverSchedule: async (change: (doc: TaskTags) => TaskTags) => {
    const next = change(state.doc);
    if (next !== state.doc) {
      state.doc = next;
      state.edits += 1;
    }
    return { success: true };
  },
}));

import { readPublish, writePublish } from "@/services/printJob";

const A = "a".repeat(64);
const B = "b".repeat(64);
const publishParam = () => state.doc.private.find((x) => x[0] === "param" && x[1] === "publish")?.[2] ?? null;

describe("publishing is one choice for every device of the account", () => {
  beforeEach(() => {
    localStorage.clear();
    forgetHeldSchedules();
    state.active = A;
    state.doc = { public: [], private: [["task", "observer"]] };
    state.edits = 0;
  });
  afterEach(() => forgetHeldSchedules());

  it("reads the schedule's choice once it is open, whatever this browser remembers", () => {
    localStorage.setItem(`frontPage:publish:${A}`, "on");
    holdSchedule(A, 100, {
      public: [],
      private: [
        ["task", "observer"],
        ["param", "publish", "no"],
      ],
    });
    expect(readPublish(A)).toBe(false);
    // Another device turned it back on, confirmed: a newer schedule wins, an older one doesn't.
    holdSchedule(A, 200, {
      public: [],
      private: [
        ["task", "observer"],
        ["param", "publish", "yes"],
      ],
    });
    holdSchedule(A, 150, {
      public: [],
      private: [
        ["task", "observer"],
        ["param", "publish", "no"],
      ],
    });
    expect(readPublish(A)).toBe(true);
  });

  it("falls back to this browser before the schedule is open", () => {
    expect(readPublish(A)).toBe(true);
    localStorage.setItem(`frontPage:publish:${A}`, "off");
    expect(readPublish(A)).toBe(false);
  });

  it("turning it off or on writes the schedule's `publish` param", async () => {
    writePublish(A, false);
    await vi.waitFor(() => expect(publishParam()).toBe("no"));
    writePublish(A, true);
    // Back on from off: not yet confirmed, so the param goes and the notice is asked again.
    await vi.waitFor(() => expect(publishParam()).toBeNull());
    expect(readTask(state.doc).task).toBe("observer");
  });

  it("never writes one account's choice into another's schedule", async () => {
    state.active = B;
    writePublish(A, false);
    await new Promise((r) => setTimeout(r, 0));
    expect(state.edits).toBe(0);
    // Still remembered for A in this browser.
    expect(localStorage.getItem(`frontPage:publish:${A}`)).toBe("off");
  });
});
