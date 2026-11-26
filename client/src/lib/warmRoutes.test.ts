/**
 * The common pages' code is fetched once the app is idle, one page after
 * another, so moving to them later shows the page, not a loading screen. Not
 * on Data Saver or a slow connection: the reader's data is theirs.
 */
import { describe, expect, it, vi } from "vitest";
import { BehaviorSubject } from "rxjs";
import { warmAppRoutes, warmRoutes } from "./warmRoutes";

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

/**
 * Who is visiting decides what is warmed: an anonymous reader gets the light
 * pages at once, the post page once they start using the app, and the
 * dashboard never; a signed-in reader gets the dashboard and the post page too.
 */
describe("warmAppRoutes", () => {
  const setup = (speed: "normal" | "slow" = "normal") => {
    const log: string[] = [];
    const idle: (() => void)[] = [];
    const active$ = new BehaviorSubject<{ pubkey: string } | undefined>(undefined);
    const target = new EventTarget();
    const pages = {
      always: [page(log, "hashtag")],
      signedIn: [page(log, "dashboard"), page(log, "post")],
      onInteraction: [page(log, "post")],
    };
    const stop = warmAppRoutes(pages, {
      active$,
      target,
      whenIdle: (run) => idle.push(run),
      speed: () => speed,
    });
    const runIdle = async () => {
      while (idle.length) idle.shift()!();
      await new Promise((r) => setTimeout(r, 0));
    };
    return { log, active$, target, runIdle, stop };
  };

  it("warms only the light pages for an anonymous reader who does nothing", async () => {
    const { log, runIdle } = setup();
    await runIdle();
    expect(log).toEqual(["hashtag"]);
  });

  it("warms the post page after an anonymous reader's first interaction", async () => {
    const { log, target, runIdle } = setup();
    await runIdle();
    target.dispatchEvent(new Event("pointerdown"));
    target.dispatchEvent(new Event("keydown"));
    await runIdle();
    expect(log).toEqual(["hashtag", "post"]);
  });

  it("warms the dashboard and the post page once someone is signed in", async () => {
    const { log, active$, runIdle } = setup();
    await runIdle();
    active$.next({ pubkey: "a" });
    active$.next({ pubkey: "b" });
    await runIdle();
    expect(log.sort()).toEqual(["dashboard", "hashtag", "post"]);
  });

  it("warms nothing on a slow connection, whoever it is", async () => {
    const { log, active$, target, runIdle } = setup("slow");
    active$.next({ pubkey: "a" });
    target.dispatchEvent(new Event("pointerdown"));
    await runIdle();
    expect(log).toEqual([]);
  });

  it("stops listening once stopped", async () => {
    const { log, active$, target, runIdle, stop } = setup();
    stop();
    active$.next({ pubkey: "a" });
    target.dispatchEvent(new Event("pointerdown"));
    await runIdle();
    expect(log).toEqual(["hashtag"]);
  });
});
