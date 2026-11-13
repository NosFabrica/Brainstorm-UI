import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { confirmPublish, getPrintJob, resetPrintJob, startPrint } from "@/services/printJob";
import { PrintJobHost, PrintingIndicator } from "./PrintJobHost";

const state = vi.hoisted(() => ({
  account: { pubkey: "a".repeat(64) } as { pubkey: string } | null,
  print: vi.fn(),
  toast: vi.fn(),
  publish: vi.fn(),
  /** Ticking clocks the indicator started, by interval. */
  clocks: [] as number[],
}));

vi.mock("applesauce-react/hooks", () => ({ useActiveAccount: () => state.account }));
vi.mock("@/hooks/use-toast", () => ({ toast: (...args: unknown[]) => state.toast(...args) }));
vi.mock("@/services/frontPage", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  printFrontPage: (...args: unknown[]) => state.print(...args),
}));
vi.mock("@/services/observerSite", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  publishToObserver: (...args: unknown[]) => state.publish(...args),
}));
vi.mock("@/hooks/useNow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useNow")>();
  return {
    ...actual,
    useNow: (ms: number) => {
      state.clocks.push(ms);
      return actual.useNow(ms);
    },
  };
});

const A = "a".repeat(64);
const KEY = { key: "sk-or-v1-x", url: "https://openrouter.ai/api/v1" };
const PRINTED = {
  status: "printed",
  html: "<html><body><h1>The Nostr Observer</h1></body></html>",
  corpus: { code: "4F2A9C", desks: { notes: [{}] } },
  changes: [],
  quotes: 1,
  usage: null,
  rounds: 1,
};

/** A print the test finishes when it wants: `finish(result)` or `fail(error)`. */
function pendingPrint() {
  let finish: (v: unknown) => void = () => {};
  let fail: (e: unknown) => void = () => {};
  state.print.mockImplementation(
    () =>
      new Promise((resolve, reject) => {
        finish = resolve;
        fail = reject;
      }),
  );
  return { finish: (v: unknown) => finish(v), fail: (e: unknown) => fail(e) };
}

function renderAt(path: string) {
  const location = memoryLocation({ path, record: true });
  const view = render(
    <Router hook={location.hook}>
      <PrintJobHost />
      <PrintingIndicator />
    </Router>,
  );
  return { ...view, location };
}

const start = () => act(() => startPrint({ pubkey: A, key: KEY, model: "m", readerName: "Lira", displayName: "Lira" }));

describe("PrintJobHost", () => {
  beforeEach(() => {
    resetPrintJob();
    sessionStorage.clear();
    localStorage.clear();
    // Publishing is not what these test.
    localStorage.setItem(`frontPage:publish:${A}`, "off");
    state.account = { pubkey: A };
    state.print.mockReset();
    state.toast.mockReset();
    state.publish.mockReset();
    state.clocks = [];
  });
  afterEach(() => resetPrintJob());

  it("shows the indicator anywhere but the Observer page while a print runs, linking back to it", async () => {
    pendingPrint();
    renderAt("/dashboard");
    expect(screen.queryByTestId("front-page-printing-indicator")).toBeNull();
    start();
    const indicator = screen.getByTestId("front-page-printing-indicator");
    expect(indicator.getAttribute("href")).toBe("/front-page");
    expect(indicator).toHaveAccessibleName(/Printing your Observer: Checking your ranking/);
  });

  it("hides the indicator on the Observer page, which shows the print itself", () => {
    pendingPrint();
    renderAt("/front-page");
    start();
    expect(screen.queryByTestId("front-page-printing-indicator")).toBeNull();
  });

  it("toasts how it ended when the reader is elsewhere, and keeps the paper for the page", async () => {
    const print = pendingPrint();
    renderAt("/dashboard");
    start();
    await act(async () => print.finish(PRINTED));
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Today's Observer is ready" }));
    expect(screen.queryByTestId("front-page-printing-indicator")).toBeNull();
    expect(getPrintJob()?.paper?.code).toBe("4F2A9C");
    expect(sessionStorage.getItem(`frontPage:last:${A}`)).toContain("4F2A9C");
  });

  it("toasts a failure with what went wrong", async () => {
    const { WriterError } = await import("@/services/frontPage");
    const print = pendingPrint();
    renderAt("/settings");
    start();
    await act(async () => print.fail(new WriterError("Your AI key is out of credit.")));
    expect(state.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Couldn't print", description: "Your AI key is out of credit." }),
    );
  });

  it("says nothing on the Observer page, which shows the result itself", async () => {
    const print = pendingPrint();
    renderAt("/front-page");
    start();
    await act(async () => print.finish(PRINTED));
    expect(state.toast).not.toHaveBeenCalled();
  });

  it("asks before the tab closes only while a print runs", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const print = pendingPrint();
    renderAt("/dashboard");
    expect(add.mock.calls.some(([type]) => type === "beforeunload")).toBe(false);
    start();
    const registered = add.mock.calls.find(([type]) => type === "beforeunload");
    expect(registered).toBeDefined();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    await act(async () => print.finish(PRINTED));
    expect(remove).toHaveBeenCalledWith("beforeunload", registered![1]);
    const after = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
    add.mockRestore();
    remove.mockRestore();
  });

  it("cancels the print when another account signs in: its paper would publish as them", async () => {
    pendingPrint();
    const view = renderAt("/dashboard");
    start();
    const signal = (state.print.mock.calls[0][0] as { signal: AbortSignal }).signal;
    state.account = { pubkey: "b".repeat(64) };
    view.rerender(
      <Router hook={view.location.hook}>
        <PrintJobHost />
        <PrintingIndicator />
      </Router>,
    );
    expect(signal.aborted).toBe(true);
    expect(getPrintJob()).toBeNull();
    expect(screen.queryByTestId("front-page-printing-indicator")).toBeNull();
    expect(state.toast).not.toHaveBeenCalled();
  });

  it("asks before the tab closes while a paid paper waits for the notice, or is publishing (audit, 2026-11-12)", async () => {
    localStorage.setItem(`frontPage:publish:${A}`, "on");
    let published: (v: unknown) => void = () => undefined;
    state.publish.mockReturnValue(new Promise((resolve) => (published = resolve)));
    const print = pendingPrint();
    renderAt("/dashboard");
    start();
    await act(async () => print.finish(PRINTED));
    // The first publish asks first: the paper waits, paid for.
    expect(getPrintJob()?.publish.state).toBe("confirm");
    const asking = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(asking);
    expect(asking.defaultPrevented).toBe(true);

    act(() => confirmPublish(A, "Lira"));
    expect(getPrintJob()?.publish.state).toBe("publishing");
    const publishing = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(publishing);
    expect(publishing.defaultPrevented).toBe(true);

    await act(async () => published({ editions: [], servers: [] }));
    const done = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(done);
    expect(done.defaultPrevented).toBe(false);
  });

  it("an account switch stops a publish in flight (audit, 2026-11-12)", async () => {
    localStorage.setItem(`frontPage:publish:${A}`, "on");
    localStorage.setItem(`frontPage:observerNotice:${A}`, "1");
    state.publish.mockReturnValue(new Promise(() => undefined));
    const print = pendingPrint();
    const view = renderAt("/dashboard");
    start();
    await act(async () => print.finish(PRINTED));
    expect(state.publish).toHaveBeenCalledTimes(1);
    const signal = (state.publish.mock.calls[0][0] as { signal: AbortSignal }).signal;
    expect(signal.aborted).toBe(false);
    state.account = { pubkey: "b".repeat(64) };
    view.rerender(
      <Router hook={view.location.hook}>
        <PrintJobHost />
        <PrintingIndicator />
      </Router>,
    );
    expect(signal.aborted).toBe(true);
    expect(getPrintJob()).toBeNull();
  });

  it("a refused print again keeps today's earlier paper (audit, 2026-11-12)", async () => {
    const first = pendingPrint();
    renderAt("/front-page");
    start();
    await act(async () => first.finish(PRINTED));
    const second = pendingPrint();
    start();
    await act(async () => second.finish({ status: "refused", violations: [], changes: [] }));
    expect(getPrintJob()?.run.state).toBe("refused");
    expect(getPrintJob()?.paper?.code).toBe("4F2A9C");
    expect(sessionStorage.getItem(`frontPage:last:${A}`)).toContain("4F2A9C");
  });

  it("the header keeps no clock running while nothing prints (audit, 2026-11-12)", async () => {
    renderAt("/dashboard");
    expect(state.clocks).not.toContain(1_000);
    pendingPrint();
    start();
    expect(state.clocks).toContain(1_000);
  });
});
