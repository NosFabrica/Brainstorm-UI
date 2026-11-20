import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readTask, type TaskTags } from "@/lib/scheduledTasks";
import { forgetHeldSchedules, holdSchedule } from "@/lib/frontPage/heldSchedule";

const state = vi.hoisted(() => ({
  active: null as string | null,
  doc: { public: [], private: [["task", "observer"]] } as TaskTags,
  edits: 0,
  /** What the next save answers; a promise that never settles is a save still out. */
  answer: null as null | Promise<{ success: boolean; error?: string }>,
  options: [] as unknown[],
}));

vi.mock("@/accounts/signing", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  activeAccount: () => (state.active ? { pubkey: state.active } : undefined),
}));
vi.mock("@/services/observerSchedule", () => ({
  updateObserverSchedule: async (change: (doc: TaskTags) => TaskTags, options?: unknown) => {
    state.options.push(options);
    if (state.answer) return state.answer;
    const next = change(state.doc);
    if (next !== state.doc) {
      state.doc = next;
      state.edits += 1;
    }
    return { success: true };
  },
}));

import { eventStore } from "@/lib/eventStore";
import { publishDecision, readPublish, resetPrintJob, writePublish } from "@/services/printJob";

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
    state.answer = null;
    state.options = [];
    resetPrintJob();
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

  it("a failed write keeps publishing off, and says so", async () => {
    holdSchedule(A, 100, {
      public: [],
      private: [
        ["task", "observer"],
        ["param", "publish", "yes"],
      ],
    });
    state.answer = Promise.resolve({ success: false, error: "None of your write relays took the change." });
    const saved = await writePublish(A, false);
    expect(saved).toMatchObject({ success: false, error: "None of your write relays took the change." });
    expect(readPublish(A)).toBe(false);
    expect(publishDecision(A)).toBe("off");
  });

  it("a write still out (a bunker approval pending) keeps publishing off meanwhile", () => {
    holdSchedule(A, 100, {
      public: [],
      private: [
        ["task", "observer"],
        ["param", "publish", "yes"],
      ],
    });
    state.answer = new Promise(() => {});
    void writePublish(A, false);
    expect(readPublish(A)).toBe(false);
    expect(publishDecision(A)).toBe("off");
  });

  it("publishes unasked only when every source says on", () => {
    localStorage.setItem(`frontPage:observerNotice:${A}`, "1");
    expect(publishDecision(A)).toBe("publish");
    // The schedule, confirmed, but this browser was turned off: asked, never published unasked.
    holdSchedule(A, 100, {
      public: [],
      private: [
        ["task", "observer"],
        ["param", "publish", "yes"],
      ],
    });
    localStorage.setItem(`frontPage:publish:${A}`, "off");
    expect(publishDecision(A)).toBe("ask");
  });

  it("a schedule this session couldn't decrypt makes publishing unknown: asked, never published unasked", () => {
    const me = "c".repeat(64);
    state.active = me;
    localStorage.setItem(`frontPage:publish:${me}`, "on");
    localStorage.setItem(`frontPage:observerNotice:${me}`, "1");
    expect(publishDecision(me)).toBe("publish");
    // Another device set publish=no; this session couldn't open it (prompt dismissed, bunker timeout).
    const stored = vi
      .spyOn(eventStore, "getReplaceable")
      .mockImplementation((kind, pubkey) =>
        kind === 34817 && pubkey === me ? ({ created_at: Math.floor(Date.now() / 1000) } as never) : undefined,
      );
    expect(publishDecision(me)).toBe("ask");
    // Once it is opened, it decides.
    holdSchedule(me, Math.floor(Date.now() / 1000), {
      public: [],
      private: [
        ["task", "observer"],
        ["param", "publish", "no"],
      ],
    });
    expect(publishDecision(me)).toBe("off");
    stored.mockRestore();
  });

  it("a choice made with no schedule yet makes none: only an existing one is edited", async () => {
    await writePublish(A, false);
    expect(state.options).toEqual([{ existingOnly: true }]);
  });
});
