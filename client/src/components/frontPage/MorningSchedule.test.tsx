/**
 * The morning paper's card. The hook and the service are mocked: what is under test is
 * what the card says, when it lets the reader change it, and that a save in flight holds
 * until the event it wrote is what the hook shows.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import type { ObserverSchedule } from "@/hooks/useObserverSchedule";
import { browserTimeZone, readTask, type TaskTags } from "@/lib/scheduledTasks";

// The hook's answer, as a store: a change re-renders whoever holds it, the way the real
// hook would. The page holds it and hands it to the card.
let state: ObserverSchedule;
const listeners = new Set<() => void>();
vi.mock("@/hooks/useObserverSchedule", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useObserverSchedule: () => {
      return useSyncExternalStore(
        (l) => {
          listeners.add(l);
          return () => listeners.delete(l);
        },
        () => state,
      );
    },
  };
});
/** The hook now says `next`. */
const hookSays = (next: ObserverSchedule) =>
  act(() => {
    state = next;
    listeners.forEach((l) => l());
  });
// Counts the card's renders: it calls useNow once per render.
const cardRenders = vi.fn();
vi.mock("@/hooks/useNow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useNow")>();
  return {
    ...actual,
    useNow: (ms: number) => {
      cardRenders();
      return actual.useNow(ms);
    },
  };
});
const update = vi.fn();
vi.mock("@/services/observerSchedule", () => ({ updateObserverSchedule: (c: unknown) => update(c) }));
// The Assistant's own keys, as the AI Model tab's endpoint gives them (hooks/useAssistantAgentKeys).
const assistantKeys = vi.hoisted(() => ({ value: { status: "loading" } as Record<string, unknown> }));
vi.mock("@/hooks/useAssistantAgentKeys", () => ({
  useAssistantAgentKeys: () => ({ reveal: () => {}, reload: () => {}, wrote: () => {}, ...assistantKeys.value }),
}));

import { useObserverSchedule } from "@/hooks/useObserverSchedule";
import { MorningSchedule } from "./MorningSchedule";

/** The card as the page uses it: one read of the schedule, handed down. */
function Card() {
  return <MorningSchedule schedule={useObserverSchedule()} />;
}

const tz = browserTimeZone();
const refresh = vi.fn();
const reveal = vi.fn();
const HOUR = 3_600_000;

function ready(cron: string, extra: string[][] = [], id = "e1", createdAt = 1000, checkedAt = Date.now()) {
  const doc: TaskTags = { public: [], private: [["task", "observer"], ["cron", cron, tz], ...extra] };
  return { status: "ready", doc, schedule: readTask(doc), eventId: id, createdAt, reveal, refresh, checkedAt } as const;
}

const switchEl = () => screen.getByTestId("front-page-schedule-switch") as HTMLButtonElement;
const time = () => screen.getByTestId("front-page-schedule-time") as HTMLInputElement;
const deferred = () => {
  let resolve: (v: unknown) => void = () => {};
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};

const READER = "a".repeat(64);

beforeEach(() => {
  update.mockReset();
  refresh.mockReset();
  localStorage.clear();
  assistantKeys.value = { status: "loading" };
});

describe("calm by default", () => {
  it("shows the sentence, the last run and the switch; the editor waits for Edit", () => {
    state = ready("0 6 * * 1-5", [["ran", String(Math.floor(Date.now() / 1000) - 3600)]]);
    render(<Card />);
    expect(screen.getByTestId("front-page-schedule-status")).toHaveTextContent("Printed each weekday at 6:00 AM");
    expect(screen.getByTestId("front-page-schedule-title")).toHaveTextContent("Morning paper");
    expect(screen.queryByTestId("front-page-schedule-time")).toBeNull();
    fireEvent.click(screen.getByTestId("front-page-schedule-edit"));
    expect(time().value).toBe("06:00");
    expect(screen.getByTestId("front-page-schedule-day-mon")).toHaveAttribute("data-state", "on");
    expect(screen.getByTestId("front-page-schedule-day-sat")).toHaveAttribute("data-state", "off");
  });

  it("opens on a tap on the card, but not on its switch", () => {
    state = ready("0 6 * * *");
    render(<Card />);
    update.mockReturnValue(new Promise(() => {}));
    fireEvent.click(switchEl());
    expect(screen.queryByTestId("front-page-schedule-panel")).toBeNull();
  });

  it("opens on a tap anywhere else on the card", () => {
    state = ready("0 6 * * *");
    render(<Card />);
    fireEvent.click(screen.getByTestId("front-page-schedule-status"));
    expect(screen.getByTestId("front-page-schedule-panel")).toBeInTheDocument();
  });

  it("closes again after a save", async () => {
    state = ready("0 6 * * *");
    update.mockResolvedValue({ success: true, id: "e2", createdAt: 2000 });
    render(<Card />);
    fireEvent.click(screen.getByTestId("front-page-schedule-edit"));
    fireEvent.change(time(), { target: { value: "07:30" } });
    await act(async () => fireEvent.click(screen.getByTestId("front-page-schedule-save")));
    await waitFor(() => expect(screen.queryByTestId("front-page-schedule-panel")).toBeNull());
  });
});

describe("saving", () => {
  it("keeps the reader's edit when a save fails", async () => {
    // A reviewer's repro: the editor re-synced to the schedule as the overlay dropped.
    state = ready("0 6 * * *");
    const out = deferred();
    update.mockReturnValue(out.promise);
    render(<Card />);
    fireEvent.click(screen.getByTestId("front-page-schedule-edit"));
    fireEvent.change(time(), { target: { value: "07:30" } });
    await act(async () => fireEvent.click(screen.getByTestId("front-page-schedule-save")));
    expect(screen.getByTestId("front-page-schedule-saving")).toHaveTextContent("Saving");
    await act(async () => out.resolve({ success: false, error: "Only 1 of your 3 write relays answered." }));
    expect(screen.getByTestId("front-page-schedule-error")).toHaveTextContent("Only 1 of your 3");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(time().value).toBe("07:30");
    expect(screen.getByTestId("front-page-schedule-save")).not.toBeDisabled();
  });

  it("holds through another device's event landing mid-save: no second save starts", async () => {
    // A reviewer's repro: any change to the hook's doc dropped the overlay and re-enabled the switch.
    state = ready("0 6 * * *");
    const out = deferred();
    update.mockReturnValue(out.promise);
    render(<Card />);
    await act(async () => fireEvent.click(switchEl()));
    expect(switchEl()).toBeDisabled();
    expect(switchEl()).toHaveAttribute("aria-checked", "false");

    hookSays(ready("0 6 * * *", [["claim", "1794398400", "abc", "Phone"]], "e-claim", 1500));
    expect(switchEl()).toBeDisabled();
    expect(switchEl()).toHaveAttribute("aria-checked", "false");
    await act(async () => fireEvent.click(switchEl()));
    expect(update).toHaveBeenCalledTimes(1);

    // Written as e2; the overlay waits until the hook shows it.
    await act(async () => out.resolve({ success: true, id: "e2", createdAt: 2000 }));
    expect(switchEl()).not.toBeDisabled();
    expect(switchEl()).toHaveAttribute("aria-checked", "false");
    hookSays(ready("0 6 * * *", [["paused"]], "e2", 2000));
    expect(switchEl()).toHaveAttribute("aria-checked", "false");
  });

  it("saves an edit made on another clock in the schedule's own zone", async () => {
    // Tokyo keeps one offset all year: an hour later on this clock is an hour later there.
    const other = tz === "Asia/Tokyo" ? "America/Sao_Paulo" : "Asia/Tokyo";
    const doc: TaskTags = {
      public: [],
      private: [
        ["task", "observer"],
        ["cron", "0 6 * * 1-5", other],
      ],
    };
    state = { ...ready("0 6 * * 1-5"), doc, schedule: readTask(doc) };
    update.mockResolvedValue({ success: true, id: "e2", createdAt: 2000 });
    render(<Card />);
    fireEvent.click(screen.getByTestId("front-page-schedule-edit"));
    const [hh, mm] = time().value.split(":").map(Number);
    fireEvent.change(time(), {
      target: { value: `${String((hh + 1) % 24).padStart(2, "0")}:${String(mm).padStart(2, "0")}` },
    });
    await act(async () => fireEvent.click(screen.getByTestId("front-page-schedule-save")));
    const change = update.mock.calls[0][0] as (d: TaskTags) => TaskTags;
    expect(readTask(change(doc))).toMatchObject({ cron: "0 7 * * 1-5", tz: other });
  });

  it("drops the overlay when a newer event than its own arrives", async () => {
    state = ready("0 6 * * *");
    update.mockResolvedValue({ success: true, id: "e2", createdAt: 2000 });
    render(<Card />);
    await act(async () => fireEvent.click(switchEl()));
    expect(switchEl()).toHaveAttribute("aria-checked", "false");
    // Still the old event: the overlay holds.
    hookSays(ready("0 6 * * *", [], "e1", 1000));
    expect(switchEl()).toHaveAttribute("aria-checked", "false");
    // Another device turned it back on after our write.
    hookSays(ready("0 6 * * *", [], "e3", 3000));
    expect(switchEl()).toHaveAttribute("aria-checked", "true");
  });
});

describe("what it says", () => {
  it("says a schedule it can't edit in words, and opens what was written", () => {
    state = ready("0 6,18 * * *");
    render(<Card />);
    expect(screen.getByTestId("front-page-schedule-status")).toHaveTextContent("Twice a day, 6:00 AM and 6:00 PM");
    expect(screen.getByTestId("front-page-schedule-title")).toHaveTextContent(/^Paper$/);
    fireEvent.click(screen.getByTestId("front-page-schedule-edit"));
    expect(screen.queryByTestId("front-page-schedule-time")).toBeNull();
    expect(screen.getByTestId("front-page-schedule-panel")).toHaveTextContent("0 6,18 * * *");
  });

  it("shows a simple time with a missing or unknown zone read-only, as written, never in the editor", () => {
    for (const [cronTag, zoneNote] of [
      [["cron", "0 6 * * 1-5"], "with no time zone"],
      [["cron", "0 6 * * 1-5", ""], "with no time zone"],
      [["cron", "0 6 * * 1-5", "Nowhere/Town"], "in Nowhere/Town, a time zone this app doesn't know"],
      [["cron", "0 6 * * 1-5", "+05:00"], "in +05:00, a time zone this app doesn't know"],
    ] as const) {
      const doc: TaskTags = { public: [], private: [["task", "observer"], [...cronTag]] };
      state = { ...ready("0 6 * * 1-5"), doc, schedule: readTask(doc) };
      const { unmount } = render(<Card />);
      const status = screen.getByTestId("front-page-schedule-status");
      expect(status).toHaveTextContent("On a schedule this app can't read");
      expect(screen.getByTestId("front-page-schedule-cron")).toHaveTextContent("0 6 * * 1-5");
      expect(screen.getByTestId("front-page-schedule-edit")).toHaveTextContent("Details");
      fireEvent.click(screen.getByTestId("front-page-schedule-edit"));
      expect(screen.queryByTestId("front-page-schedule-editor")).toBeNull();
      // What was written, so the reader can tell a missing zone from a misspelt one.
      expect(screen.getByTestId("front-page-schedule-panel")).toHaveTextContent(zoneNote);
      expect(screen.getByTestId("front-page-schedule-panel")).toHaveTextContent("Set in another app");
      unmount();
    }
  });

  it("shows an expression it can't say as written, whole", () => {
    state = ready("0 6 1-7 * 1");
    render(<Card />);
    expect(screen.getByTestId("front-page-schedule-cron")).toHaveTextContent("0 6 1-7 * 1");
    expect(screen.getByTestId("front-page-schedule-cron").className).toContain("break-all");
  });

  it("warns of a missed morning only from what the relays said when last asked, and asks again", () => {
    const now = Date.now();
    // Due at the top of an hour more than three hours ago; last ran a day before that.
    const cron = `0 ${new Date(now - 5 * HOUR).getHours()} * * *`;
    // Ran after yesterday's: fine as of the last ask, missed as of now.
    const ran = String(Math.floor((now - 20 * HOUR) / 1000));
    state = { ...ready(cron, [["ran", ran]]), checkedAt: now - 10 * HOUR };
    render(<Card />);
    expect(screen.queryByTestId("front-page-schedule-missed")).toBeNull();
    expect(refresh).toHaveBeenCalled();
    hookSays({ ...ready(cron, [["ran", ran]]), checkedAt: now });
    expect(screen.getByTestId("front-page-schedule-missed")).toHaveTextContent("Not printed since");
  });

  it("offers a retry when the signer failed", () => {
    state = { status: "failed", error: "Your signer didn't answer.", reveal, refresh, checkedAt: null };
    render(<Card />);
    expect(screen.getByTestId("front-page-schedule-status")).toHaveTextContent("Couldn't open your schedule");
    fireEvent.click(screen.getByTestId("front-page-schedule-retry"));
    expect(reveal).toHaveBeenCalled();
  });
});

describe("accessibility", () => {
  it("announces the status, hides decorative icons, and says the zone without hover", () => {
    const other = tz === "Asia/Tokyo" ? "Europe/Lisbon" : "Asia/Tokyo";
    const doc: TaskTags = {
      public: [],
      private: [
        ["task", "observer"],
        ["cron", "0 6 * * *", other],
      ],
    };
    state = { ...ready("0 6 * * *"), doc, schedule: readTask(doc) };
    const { container } = render(<Card />);
    const status = screen.getByTestId("front-page-schedule-status");
    expect(status).toHaveAttribute("role", "status");
    const described = document.getElementById(status.getAttribute("aria-describedby")!);
    expect(described).toHaveTextContent(/Set on (Tokyo|Lisbon) time/);
    for (const svg of container.querySelectorAll("svg")) {
      expect(svg.closest("[aria-hidden=true]"), svg.outerHTML).not.toBeNull();
    }
  });
});

describe("rendering", () => {
  it("doesn't re-render with the page around it", () => {
    state = ready("0 6 * * *");
    let bump: () => void = () => {};
    function Page() {
      const [n, setN] = useState(0);
      bump = () => setN((x) => x + 1);
      const schedule = useObserverSchedule();
      return (
        <div data-n={n}>
          <MorningSchedule schedule={schedule} />
        </div>
      );
    }
    render(<Page />);
    const before = cardRenders.mock.calls.length;
    act(() => bump());
    act(() => bump());
    expect(cardRenders.mock.calls.length).toBe(before);
    // ...and does when the schedule changes.
    hookSays(ready("0 7 * * *"));
    expect(cardRenders.mock.calls.length).toBeGreaterThan(before);
  });
});

describe("focus and the editor's semantics (audit, 2026-11-12)", () => {
  const editButton = () => screen.getByTestId("front-page-schedule-edit");

  it("moves focus into the editor on open, and back to Edit on Cancel", () => {
    state = ready("0 6 * * *");
    render(<Card />);
    expect(editButton()).toHaveAttribute("aria-expanded", "false");
    editButton().focus();
    fireEvent.click(editButton());
    expect(document.activeElement).toBe(time());
    expect(editButton()).toHaveAttribute("aria-expanded", "true");
    const controlled = document.getElementById(editButton().getAttribute("aria-controls")!);
    expect(controlled).toBe(screen.getByTestId("front-page-schedule-panel"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByTestId("front-page-schedule-panel")).toBeNull();
    expect(document.activeElement).toBe(editButton());
    expect(editButton()).toHaveAttribute("aria-expanded", "false");
    // Nothing it points at is missing.
    const points = editButton().getAttribute("aria-controls");
    if (points) expect(document.getElementById(points)).not.toBeNull();
  });

  it("returns focus to Edit after a save closes the editor", async () => {
    state = ready("0 6 * * *");
    update.mockResolvedValue({ success: true, id: "e2", createdAt: 2000 });
    render(<Card />);
    fireEvent.click(editButton());
    fireEvent.change(time(), { target: { value: "07:30" } });
    await act(async () => fireEvent.click(screen.getByTestId("front-page-schedule-save")));
    await waitFor(() => expect(screen.queryByTestId("front-page-schedule-panel")).toBeNull());
    expect(document.activeElement).toBe(editButton());
  });

  it("names the card with a heading", () => {
    state = ready("0 6 * * *");
    render(<Card />);
    expect(screen.getByRole("heading", { name: "Morning paper" })).toBe(
      screen.getByTestId("front-page-schedule-title"),
    );
  });

  it("links the time to the note naming the schedule's zone", () => {
    const other = tz === "Asia/Tokyo" ? "Europe/Lisbon" : "Asia/Tokyo";
    const doc: TaskTags = {
      public: [],
      private: [
        ["task", "observer"],
        ["cron", "0 6 * * *", other],
      ],
    };
    state = { ...ready("0 6 * * *"), doc, schedule: readTask(doc) };
    render(<Card />);
    fireEvent.click(editButton());
    const note = document.getElementById(time().getAttribute("aria-describedby") ?? "");
    expect(note).toHaveTextContent(/Set on (Tokyo|Lisbon) time/);
  });

  it("says nothing of another zone for the same zone by another name", () => {
    const alias = tz === "UTC" ? "Etc/UTC" : tz === "Asia/Kolkata" ? "Asia/Calcutta" : null;
    if (!alias) return;
    const doc: TaskTags = {
      public: [],
      private: [
        ["task", "observer"],
        ["cron", "0 6 * * *", alias],
      ],
    };
    state = { ...ready("0 6 * * *"), doc, schedule: readTask(doc) };
    render(<Card />);
    expect(screen.getByTestId("front-page-schedule-status")).not.toHaveAttribute("aria-describedby");
  });

  it("offers Retry when a save failed for a reason a retry may fix, and retries the same change", async () => {
    state = ready("0 6 * * *");
    update.mockResolvedValueOnce({
      success: false,
      retryable: true,
      error: "Couldn't load your relay list, so nothing was changed. Try again.",
    });
    render(<Card />);
    fireEvent.click(editButton());
    fireEvent.change(time(), { target: { value: "07:30" } });
    await act(async () => fireEvent.click(screen.getByTestId("front-page-schedule-save")));
    expect(screen.getByTestId("front-page-schedule-error")).toHaveTextContent("Couldn't load your relay list");
    update.mockResolvedValueOnce({ success: true, id: "e2", createdAt: 2000 });
    await act(async () => fireEvent.click(screen.getByTestId("front-page-schedule-save-retry")));
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[1][0]).toBe(update.mock.calls[0][0]);
    await waitFor(() => expect(screen.queryByTestId("front-page-schedule-error")).toBeNull());
  });
});

describe("who prints: devices or the Brainstorm Assistant (NIP-FB runner)", () => {
  const ASSISTANT = "b".repeat(64);
  const NO_SITES = { reader: null, runner: null };
  const withRunner = (runners: string[], extra: string[][] = [], cron = "0 6 * * *") => {
    const doc: TaskTags = {
      public: runners.map((r) => ["p", r]),
      private: [["task", "observer"], ["cron", cron, tz, "1"], ...extra],
    };
    return { ...ready(cron), doc, schedule: readTask(doc), runners } as unknown as ObserverSchedule;
  };
  const sec = (ms: number) => Math.floor(ms / 1000);

  it("isn't offered to a reader without an Assistant", () => {
    render(<MorningSchedule schedule={ready("0 6 * * *") as unknown as ObserverSchedule} assistant={null} />);
    expect(screen.queryByTestId("front-page-schedule-who")).toBeNull();
  });

  it("is offered with an Assistant, on devices by default, and choosing it names the Assistant", async () => {
    update.mockResolvedValue({ success: true });
    localStorage.setItem(`frontPage:observerNotice:${READER}`, "1");
    render(
      <MorningSchedule
        schedule={ready("0 6 * * *") as unknown as ObserverSchedule}
        reader={READER}
        assistant={ASSISTANT}
      />,
    );
    const devices = screen.getByTestId("front-page-schedule-who-devices");
    expect(devices).toHaveAttribute("data-state", "on");
    await act(async () => fireEvent.click(screen.getByTestId("front-page-schedule-who-assistant")));
    expect(update).toHaveBeenCalledTimes(1);
    const change = update.mock.calls[0][0] as (d: TaskTags) => TaskTags;
    const doc: TaskTags = {
      public: [],
      private: [
        ["task", "observer"],
        ["param", "size", "a3"],
      ],
    };
    expect(change(doc)).toEqual({ public: [["p", ASSISTANT]], private: doc.private });
    // A schedule's cron is marked as set now: the mornings before the switch are nobody's.
    const before = Date.now();
    const timed = change({ public: [], private: [["cron", "0 6 * * *", tz, "1"]] });
    expect(readTask(timed).setAt).toBeGreaterThanOrEqual(Math.floor(before / 1000));
  });

  it("switching back to devices removes the runner", async () => {
    update.mockResolvedValue({ success: true });
    render(<MorningSchedule schedule={withRunner([ASSISTANT])} assistant={ASSISTANT} sites={NO_SITES} />);
    expect(screen.getByTestId("front-page-schedule-who-assistant")).toHaveAttribute("data-state", "on");
    expect(screen.getByTestId("front-page-schedule-who-note")).toHaveTextContent("It prints with keys you give it");
    await act(async () => fireEvent.click(screen.getByTestId("front-page-schedule-who-devices")));
    const change = update.mock.calls[0][0] as (d: TaskTags) => TaskTags;
    expect(change({ public: [["p", ASSISTANT]], private: [] })).toEqual({ public: [], private: [] });
  });

  it("migrates the remembered model into an edit that changes something, and only then", async () => {
    update.mockResolvedValue({ success: true });
    const migrate = (d: TaskTags) => ({ ...d, private: [...d.private, ["param", "model", "m"]] });
    localStorage.setItem(`frontPage:observerNotice:${READER}`, "1");
    render(
      <MorningSchedule
        schedule={ready("0 6 * * *") as unknown as ObserverSchedule}
        reader={READER}
        assistant={ASSISTANT}
        migrate={migrate}
      />,
    );
    await act(async () => fireEvent.click(screen.getByTestId("front-page-schedule-who-assistant")));
    const change = update.mock.calls[0][0] as (d: TaskTags) => TaskTags;
    expect(change({ public: [], private: [] }).private).toEqual([["param", "model", "m"]]);
    const named: TaskTags = { public: [["p", ASSISTANT]], private: [] };
    expect(change(named)).toBe(named);
  });

  it("says the Assistant printed last, from the newest printedAt on either site", () => {
    const at = Date.now() - 3 * HOUR;
    render(
      <MorningSchedule
        schedule={withRunner([ASSISTANT])}
        assistant={ASSISTANT}
        sites={{
          reader: [{ day: "2026-01-01", printedAt: sec(at - 48 * HOUR) }],
          runner: [{ day: "x", printedAt: sec(at) }],
        }}
      />,
    );
    expect(screen.getByTestId("front-page-schedule-ran")).toHaveTextContent(
      "Last printed by your Assistant, 3 hours ago",
    );
    expect(screen.queryByTestId("front-page-schedule-device-hint")).toBeNull();
  });

  it("warns, from both sites, when a morning more than 3 hours past has no paper, and not before they answered", () => {
    // Due every minute's hour: an hourly schedule always has a run more than 3 hours past.
    const hourly = withRunner([ASSISTANT], [], "0 * * * *");
    const old = Date.now() - 30 * HOUR;
    const { rerender } = render(<MorningSchedule schedule={hourly} assistant={ASSISTANT} sites={NO_SITES} />);
    expect(screen.queryByTestId("front-page-schedule-missed")).toBeNull();
    expect(screen.getByTestId("front-page-schedule-ran")).toHaveTextContent("Checking its papers");
    rerender(
      <MorningSchedule
        schedule={hourly}
        assistant={ASSISTANT}
        sites={{ reader: [], runner: [{ day: "x", printedAt: sec(old) }] }}
      />,
    );
    expect(screen.getByTestId("front-page-schedule-missed")).toHaveTextContent("Not printed since");
  });

  it("says so when the Assistant's site couldn't be read, instead of checking forever (audit, 2026-11-12)", () => {
    render(
      <MorningSchedule
        schedule={withRunner([ASSISTANT])}
        assistant={ASSISTANT}
        sites={{ reader: [], runner: null, runnerFailed: true }}
      />,
    );
    expect(screen.getByTestId("front-page-schedule-ran")).toHaveTextContent("Couldn't check its papers");
  });

  it("names a conflict when two keys are named, and nobody prints", () => {
    render(
      <MorningSchedule schedule={withRunner([ASSISTANT, "c".repeat(64)])} assistant={ASSISTANT} sites={NO_SITES} />,
    );
    expect(screen.getByTestId("front-page-schedule-conflict")).toHaveTextContent(
      "Conflict: 2 keys are named to print it, so nobody does.",
    );
    expect(screen.getByTestId("front-page-schedule-who-devices")).toHaveAttribute("data-state", "off");
    expect(screen.getByTestId("front-page-schedule-who-assistant")).toHaveAttribute("data-state", "off");
  });

  it("asks first that the Observer is public, when the reader hasn't agreed yet (audit, 2026-11-12)", async () => {
    update.mockResolvedValue({ success: true });
    render(
      <MorningSchedule
        schedule={ready("0 6 * * *") as unknown as ObserverSchedule}
        reader={READER}
        assistant={ASSISTANT}
      />,
    );
    await act(async () => fireEvent.click(screen.getByTestId("front-page-schedule-who-assistant")));
    const consent = screen.getByTestId("front-page-schedule-who-consent");
    expect(consent).toHaveTextContent("Anyone can read your Observer");
    expect(update).not.toHaveBeenCalled();

    // Not now: nothing is named, and nothing is remembered.
    await act(async () => fireEvent.click(screen.getByTestId("front-page-schedule-who-consent-later")));
    expect(screen.queryByTestId("front-page-schedule-who-consent")).toBeNull();
    expect(update).not.toHaveBeenCalled();
    expect(localStorage.getItem(`frontPage:observerNotice:${READER}`)).toBeNull();

    // Yes: the same agreement the publish flow asks for, then the Assistant is named.
    await act(async () => fireEvent.click(screen.getByTestId("front-page-schedule-who-assistant")));
    await act(async () => fireEvent.click(screen.getByTestId("front-page-schedule-who-consent-ok")));
    expect(localStorage.getItem(`frontPage:observerNotice:${READER}`)).toBe("1");
    expect(update).toHaveBeenCalledTimes(1);
    const change = update.mock.calls[0][0] as (d: TaskTags) => TaskTags;
    expect(change({ public: [], private: [] }).public).toEqual([["p", ASSISTANT]]);
  });

  it("asks nothing again of a reader who agreed when they first published", async () => {
    update.mockResolvedValue({ success: true });
    localStorage.setItem(`frontPage:observerNotice:${READER}`, "1");
    render(
      <MorningSchedule
        schedule={ready("0 6 * * *") as unknown as ObserverSchedule}
        reader={READER}
        assistant={ASSISTANT}
      />,
    );
    await act(async () => fireEvent.click(screen.getByTestId("front-page-schedule-who-assistant")));
    expect(screen.queryByTestId("front-page-schedule-who-consent")).toBeNull();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("warns when the Assistant doesn't hold the schedule's key, linking to where it's given one (audit, 2026-11-12)", () => {
    const OR = "https://openrouter.ai/api/v1";
    const named = withRunner([ASSISTANT], [["param", "key", OR, "a3f9"]]);
    assistantKeys.value = { status: "ready", keys: [{ key: "sk-or-v1-other-0000", url: OR }] };
    const { rerender } = render(<MorningSchedule schedule={named} assistant={ASSISTANT} sites={NO_SITES} />);
    const warning = screen.getByTestId("front-page-schedule-who-no-key");
    expect(warning).toHaveTextContent("Your Assistant doesn't have this key: give it one");
    expect(warning.querySelector("a")?.getAttribute("href")).toBe("/settings?tab=assistants&view=ai");

    assistantKeys.value = { status: "ready", keys: [{ key: "sk-or-v1-given-a3f9", url: OR }] };
    rerender(
      <MorningSchedule
        schedule={withRunner([ASSISTANT], [["param", "key", OR, "a3f9"]])}
        assistant={ASSISTANT}
        sites={NO_SITES}
      />,
    );
    expect(screen.queryByTestId("front-page-schedule-who-no-key")).toBeNull();

    // A list it couldn't read says nothing.
    assistantKeys.value = { status: "locked" };
    rerender(
      <MorningSchedule
        schedule={withRunner([ASSISTANT], [["param", "key", OR, "a3f9"]])}
        assistant={ASSISTANT}
        sites={NO_SITES}
      />,
    );
    expect(screen.queryByTestId("front-page-schedule-who-no-key")).toBeNull();
  });

  it("doesn't look at the Assistant's keys while the devices print", () => {
    assistantKeys.value = { status: "ready", keys: [] };
    render(<MorningSchedule schedule={ready("0 6 * * *") as unknown as ObserverSchedule} assistant={ASSISTANT} />);
    expect(screen.queryByTestId("front-page-schedule-who-no-key")).toBeNull();
  });

  it("names another key when the runner isn't this account's Assistant", () => {
    render(<MorningSchedule schedule={withRunner(["c".repeat(64)])} assistant={ASSISTANT} sites={NO_SITES} />);
    expect(screen.getByTestId("front-page-schedule-who-other")).toBeTruthy();
  });
});
