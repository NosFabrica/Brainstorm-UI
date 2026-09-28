// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { collectDiagnostics } from "./supportDiagnostics";
import { installErrorBuffer, _resetErrorBuffer } from "./errorBuffer";

describe("collectDiagnostics — what support would ask for in the first reply", () => {
  beforeEach(() => _resetErrorBuffer());

  it("answers the usual questions: environment, page, screen", () => {
    const d = collectDiagnostics();
    expect(d["App"]).toContain("0.1.0-alpha");
    expect(d["Browser"]).toBeTruthy(); // user agent
    expect(d["Page"]).toContain("/"); // current path
    expect(d["Screen"]).toMatch(/\d+×\d+/);
    expect(d["Time"]).toBeTruthy();
  });

  it("carries the recent console errors when there are any — and no key when clean", () => {
    expect(collectDiagnostics()["Recent errors"]).toBeUndefined();

    installErrorBuffer();
    window.dispatchEvent(new ErrorEvent("error", { message: "render exploded" }));
    expect(collectDiagnostics()["Recent errors"]).toContain("render exploded");
  });
});
