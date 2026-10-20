// @vitest-environment jsdom
/**
 * A page's code can be fetched ahead of a visit (the app warms the common
 * pages once it's idle): `preload()` starts the one download the page itself
 * then uses, so arriving there asks for nothing more.
 */
import { Suspense } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { lazyWithReload } from "./lazyWithReload";

describe("lazyWithReload preload", () => {
  it("downloads the page once, ahead of the visit, and the visit uses it", async () => {
    const load = vi.fn(async () => ({ default: () => <p>the page</p> }));
    const Page = lazyWithReload(load);
    await Page.preload();
    expect(load).toHaveBeenCalledTimes(1);
    render(
      <Suspense fallback={<p>loading</p>}>
        <Page />
      </Suspense>,
    );
    expect(await screen.findByText("the page")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("swallows a failed warm-up: the visit tries again, and reloads as before if it must", async () => {
    let fail = true;
    const load = vi.fn(async () => {
      if (fail) throw new Error("offline");
      return { default: () => <p>the page</p> };
    });
    const Page = lazyWithReload(load);
    await expect(Page.preload()).resolves.toBeUndefined();
    fail = false;
    render(
      <Suspense fallback={<p>loading</p>}>
        <Page />
      </Suspense>,
    );
    expect(await screen.findByText("the page")).toBeInTheDocument();
  });
});
