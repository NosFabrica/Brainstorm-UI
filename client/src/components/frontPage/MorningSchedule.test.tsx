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

// The hook's answer, as a store: a change re-renders the card the way the real hook would
// (the card is memoized, so re-rendering its parent doesn't).
let state: ObserverSchedule;
const listeners = new Set<() => void>();
const hookCalls = vi.fn();
vi.mock("@/hooks/useObserverSchedule", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useObserverSchedule: () => {
      hookCalls();
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
const update = vi.fn();
vi.mock("@/services/observerSchedule", () => ({ updateObserverSchedule: (c: unknown) => update(c) }));

import { MorningSchedule } from "./MorningSchedule";

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

beforeEach(() => {
  update.mockReset();
  refresh.mockReset();
  hookCalls.mockReset();
});

describe("calm by default", () => {
  it("shows the sentence, the last run and the switch; the editor waits for Edit", () => {
    state = ready("0 6 * * 1-5", [["ran", String(Math.floor(Date.now() / 1000) - 3600)]]);
    render(<MorningSchedule />);
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
    render(<MorningSchedule />);
    update.mockReturnValue(new Promise(() => {}));
    fireEvent.click(switchEl());
    expect(screen.queryByTestId("front-page-schedule-panel")).toBeNull();
  });

  it("opens on a tap anywhere else on the card", () => {
    state = ready("0 6 * * *");
    render(<MorningSchedule />);
    fireEvent.click(screen.getByTestId("front-page-schedule-status"));
    expect(screen.getByTestId("front-page-schedule-panel")).toBeInTheDocument();
  });

  it("closes again after a save", async () => {
    state = ready("0 6 * * *");
    update.mockResolvedValue({ success: true, id: "e2", createdAt: 2000 });
    render(<MorningSchedule />);
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
    render(<MorningSchedule />);
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
    render(<MorningSchedule />);
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

  it("drops the overlay when a newer event than its own arrives", async () => {
    state = ready("0 6 * * *");
    update.mockResolvedValue({ success: true, id: "e2", createdAt: 2000 });
    render(<MorningSchedule />);
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
    render(<MorningSchedule />);
    expect(screen.getByTestId("front-page-schedule-status")).toHaveTextContent("Twice a day, 6:00 AM and 6:00 PM");
    expect(screen.getByTestId("front-page-schedule-title")).toHaveTextContent(/^Paper$/);
    fireEvent.click(screen.getByTestId("front-page-schedule-edit"));
    expect(screen.queryByTestId("front-page-schedule-time")).toBeNull();
    expect(screen.getByTestId("front-page-schedule-panel")).toHaveTextContent("0 6,18 * * *");
  });

  it("shows an expression it can't say as written, whole", () => {
    state = ready("0 6 1-7 * 1");
    render(<MorningSchedule />);
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
    render(<MorningSchedule />);
    expect(screen.queryByTestId("front-page-schedule-missed")).toBeNull();
    expect(refresh).toHaveBeenCalled();
    hookSays({ ...ready(cron, [["ran", ran]]), checkedAt: now });
    expect(screen.getByTestId("front-page-schedule-missed")).toHaveTextContent("Not printed since");
  });

  it("offers a retry when the signer failed", () => {
    state = { status: "failed", error: "Your signer didn't answer.", reveal, refresh, checkedAt: null };
    render(<MorningSchedule />);
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
    const { container } = render(<MorningSchedule />);
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
      return (
        <div data-n={n}>
          <MorningSchedule />
        </div>
      );
    }
    render(<Page />);
    const before = hookCalls.mock.calls.length;
    act(() => bump());
    act(() => bump());
    expect(hookCalls.mock.calls.length).toBe(before);
  });
});
