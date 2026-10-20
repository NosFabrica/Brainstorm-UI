/**
 * The common pages' code is fetched once the app is idle, one page after
 * another, so moving to them later shows the page, not a loading screen. Not
 * on Data Saver or a slow connection: the reader's data is theirs.
 */
import { describe, expect, it, vi } from "vitest";
import { warmRoutes } from "./warmRoutes";

const page = (log: string[], name: string) => ({
  preload: vi.fn(async () => {
    log.push(name);
  }),
});

describe("warmRoutes", () => {
  it("fetches nothing until idle, then each page in turn", async () => {
    const log: string[] = [];
    let idle: (() => void) | null = null;
    const pages = [page(log, "post"), page(log, "hashtag"), page(log, "dashboard")];
    warmRoutes(pages, { whenIdle: (run) => (idle = run), speed: () => "normal" });
    expect(log).toEqual([]);
    idle!();
    await vi.waitFor(() => expect(log).toEqual(["post", "hashtag", "dashboard"]));
  });

  it("fetches nothing on Data Saver or a slow connection", async () => {
    const log: string[] = [];
    for (const speed of ["slow", "very-slow"] as const) {
      let idle: (() => void) | null = null;
      warmRoutes([page(log, "post")], { whenIdle: (run) => (idle = run), speed: () => speed });
      idle?.();
    }
    await new Promise((r) => setTimeout(r, 0));
    expect(log).toEqual([]);
  });
});
