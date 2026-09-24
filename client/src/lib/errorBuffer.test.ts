// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { installErrorBuffer, recentErrors, _resetErrorBuffer } from "./errorBuffer";

describe("errorBuffer — the last few console errors, for diagnostics", () => {
  beforeEach(() => _resetErrorBuffer());

  it("captures window errors and unhandled rejections, newest last", () => {
    installErrorBuffer();
    window.dispatchEvent(new ErrorEvent("error", { message: "boom one" }));
    window.dispatchEvent(
      new PromiseRejectionEvent("unhandledrejection", {
        promise: Promise.resolve(),
        reason: new Error("boom two"),
      }),
    );

    const errors = recentErrors();
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("boom one");
    expect(errors[1]).toContain("boom two");
  });

  it("keeps only the most recent handful", () => {
    installErrorBuffer();
    for (let i = 0; i < 30; i++) {
      window.dispatchEvent(new ErrorEvent("error", { message: `err ${i}` }));
    }
    const errors = recentErrors();
    expect(errors.length).toBeLessThanOrEqual(10);
    expect(errors.at(-1)).toContain("err 29");
  });

  it("installing twice doesn't double-capture", () => {
    installErrorBuffer();
    installErrorBuffer();
    window.dispatchEvent(new ErrorEvent("error", { message: "once" }));
    expect(recentErrors()).toHaveLength(1);
  });
});
