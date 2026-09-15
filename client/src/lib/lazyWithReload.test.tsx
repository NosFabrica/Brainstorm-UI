// @vitest-environment jsdom
/** A code chunk a deploy removed reloads the page once, never in a loop. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Component, Suspense, type ComponentType, type ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { CHUNK_RELOAD_FLAG, lazyWithReload } from "./lazyWithReload";

const failingLoad = () => Promise.reject(new TypeError("Failed to fetch dynamically imported module"));

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

function Page() {
  return <p>console</p>;
}

function mount(Lazy: ComponentType, onError: (e: unknown) => void) {
  class Catch extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() {
      return { failed: true };
    }
    componentDidCatch(e: unknown) {
      onError(e);
    }
    render() {
      return this.state.failed ? <p>failed</p> : this.props.children;
    }
  }
  return render(
    <Catch>
      <Suspense fallback={<p>loading</p>}>
        <Lazy />
      </Suspense>
    </Catch>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("lazyWithReload", () => {
  it("renders the page and forgets any earlier reload", async () => {
    const storage = fakeStorage();
    storage.setItem(CHUNK_RELOAD_FLAG, String(Date.now()));
    const reload = vi.fn();
    const Lazy = lazyWithReload(async () => ({ default: Page }), { storage, reload });
    mount(Lazy, vi.fn());
    expect(await screen.findByText("console")).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    expect(storage.data.size).toBe(0);
  });

  it("reloads once when the chunk can't be fetched", async () => {
    const storage = fakeStorage();
    const reload = vi.fn();
    const Lazy = lazyWithReload(failingLoad, { storage, reload });
    mount(Lazy, vi.fn());
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("failed")).toBeNull();
  });

  it("shows the error instead of reloading again when the chunk still can't be fetched", async () => {
    const storage = fakeStorage();
    storage.setItem(CHUNK_RELOAD_FLAG, String(Date.now()));
    const reload = vi.fn();
    const onError = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Lazy = lazyWithReload(failingLoad, { storage, reload });
    mount(Lazy, onError);
    expect(await screen.findByText("failed")).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
  });

  it("reloads again for a later deploy, long after an earlier reload", async () => {
    const storage = fakeStorage();
    storage.setItem(CHUNK_RELOAD_FLAG, String(Date.now() - 10 * 60_000));
    const reload = vi.fn();
    const Lazy = lazyWithReload(failingLoad, { storage, reload });
    mount(Lazy, vi.fn());
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it("shows the error, without reloading, when session storage is unusable", async () => {
    const storage = { getItem: () => null, setItem: () => { throw new Error("quota"); }, removeItem: () => {} };
    const reload = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Lazy = lazyWithReload(failingLoad, { storage, reload });
    mount(Lazy, vi.fn());
    expect(await screen.findByText("failed")).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });
});
