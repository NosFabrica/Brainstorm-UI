import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetServiceWorker,
  BUILD_ID,
  applyUpdate,
  onOpenUrl,
  registerServiceWorker,
  showAppNotification,
  useAppUpdate,
} from "./serviceWorker";

/** A worker that answers the build-id question with `id`. */
function worker(id: string | null) {
  const posted: unknown[] = [];
  const w = {
    state: "installed",
    posted,
    addEventListener: vi.fn(),
    postMessage(message: { type: string }, ports?: MessagePort[]) {
      posted.push(message);
      if (message.type === "BUILD_ID" && id !== null) ports?.[0]?.postMessage(id);
    },
  };
  return w;
}

function install({ waiting, controlled = true }: { waiting: ReturnType<typeof worker> | null; controlled?: boolean }) {
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  const reg = {
    waiting,
    active: { postMessage: vi.fn() },
    update: vi.fn(() => Promise.resolve()),
    addEventListener: vi.fn(),
    showNotification: vi.fn(() => Promise.resolve()),
  };
  const container = {
    controller: controlled ? {} : null,
    ready: Promise.resolve(reg),
    register: vi.fn(() => Promise.resolve(reg)),
    getRegistration: vi.fn(() => Promise.resolve(reg)),
    addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] ??= []).push(fn),
  };
  vi.stubGlobal("navigator", { ...navigator, serviceWorker: container });
  return { reg, container, fire: (type: string, e: unknown) => listeners[type]?.forEach((fn) => fn(e)) };
}

const settle = () => act(() => new Promise((r) => setTimeout(r, 20)));

beforeEach(() => {
  __resetServiceWorker();
  vi.stubEnv("PROD", true);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("taking a deploy", () => {
  it("swaps a worker of this page's own build in quietly", async () => {
    const w = worker(BUILD_ID);
    install({ waiting: w });
    const { result } = renderHook(() => useAppUpdate());
    registerServiceWorker();
    await settle();
    expect(w.posted).toContainEqual({ type: "SKIP_WAITING" });
    expect(result.current).toBe(false);
  });

  it("offers a reload when the page is older than the waiting worker", async () => {
    const w = worker("a-newer-build");
    install({ waiting: w });
    const { result } = renderHook(() => useAppUpdate());
    registerServiceWorker();
    await settle();
    expect(result.current).toBe(true);
    expect(w.posted).not.toContainEqual({ type: "SKIP_WAITING" });
  });

  it("offers it too when the worker won't say its build", async () => {
    install({ waiting: worker(null) });
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const { result } = renderHook(() => useAppUpdate());
    registerServiceWorker();
    await vi.advanceTimersByTimeAsync(3500);
    vi.useRealTimers();
    await settle();
    expect(result.current).toBe(true);
  });

  it("leaves a first install alone: it takes the page over by itself", async () => {
    const w = worker("whatever");
    install({ waiting: w, controlled: false });
    const { result } = renderHook(() => useAppUpdate());
    registerServiceWorker();
    await settle();
    expect(w.posted).toEqual([]);
    expect(result.current).toBe(false);
  });

  it("reloads on the reader's Reload, and only then", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    const w = worker("a-newer-build");
    const { fire } = install({ waiting: w });
    registerServiceWorker();
    await settle();
    fire("controllerchange", {});
    expect(reload).not.toHaveBeenCalled();
    applyUpdate();
    expect(w.posted).toContainEqual({ type: "SKIP_WAITING" });
    fire("controllerchange", {});
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("notifications", () => {
  it("go through the worker, carrying where a tap should land", async () => {
    const { reg } = install({ waiting: null });
    expect(await showAppNotification("Ana", { body: "hi", tag: "room", url: "/messages/x" })).toBe(true);
    expect(reg.showNotification).toHaveBeenCalledWith(
      "Ana",
      expect.objectContaining({ body: "hi", tag: "room", data: { url: "/messages/x" } }),
    );
  });

  it("say so where there is no worker, for the caller's fallback", async () => {
    vi.stubGlobal("navigator", {});
    expect(await showAppNotification("Ana", { url: "/" })).toBe(false);
  });

  it("hand a tapped one's path to the app, even one tapped before it was listening", async () => {
    const { fire } = install({ waiting: null });
    registerServiceWorker();
    fire("message", { data: { type: "OPEN_URL", url: "/messages/early" } });
    const seen: string[] = [];
    const stop = onOpenUrl((url) => seen.push(url));
    fire("message", { data: { type: "OPEN_URL", url: "/messages/later" } });
    stop();
    expect(seen).toEqual(["/messages/early", "/messages/later"]);
  });
});
