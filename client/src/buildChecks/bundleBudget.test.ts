/**
 * The build fails when the entry outgrows its budget, or when the chunks the
 * first page loads import each other in a circle (the page then throws before
 * it draws anything).
 */
import { describe, expect, it } from "vitest";
import { bundleReport, chunkCycle, type BudgetFile } from "./bundleBudget";

const chunk = (fileName: string, imports: string[], code = "", isEntry = false): BudgetFile => ({
  type: "chunk",
  fileName,
  isEntry,
  imports,
  code,
});
const bundleOf = (...files: BudgetFile[]) => Object.fromEntries(files.map((f) => [f.fileName, f]));
const length = (code: string) => code.length;

describe("bundleReport", () => {
  it("sums the entry and the chunks it statically imports", () => {
    const bundle = bundleOf(
      chunk("index.js", ["react.js", "nostr.js"], "x".repeat(10), true),
      chunk("nostr.js", ["react.js"], "x".repeat(5)),
      chunk("react.js", [], "x".repeat(3)),
      chunk("Page.js", ["react.js"], "x".repeat(100)),
    );
    const report = bundleReport(bundle, length, 50);
    expect(report.entryGz).toBe(10);
    expect(report.firstLoad.sort()).toEqual(["index.js", "nostr.js", "react.js"]);
    expect(report.firstLoadGz).toBe(18);
    expect(report.problems).toEqual([]);
  });

  it("names an entry over its budget", () => {
    const bundle = bundleOf(chunk("index.js", [], "x".repeat(2048), true));
    expect(bundleReport(bundle, length, 1024).problems).toEqual([
      "index.js is 2 KB gzipped, over its 1 KB budget (ENTRY_BUDGET_GZ)",
    ]);
  });

  it("names a cycle among the first page's chunks", () => {
    const bundle = bundleOf(
      chunk("index.js", ["react.js"], "", true),
      chunk("react.js", ["nostr.js"]),
      chunk("nostr.js", ["react.js"]),
    );
    expect(chunkCycle(bundle, "index.js")).toEqual(["react.js", "nostr.js", "react.js"]);
    expect(bundleReport(bundle, length).problems[0]).toMatch(/cycle: react\.js -> nostr\.js -> react\.js/);
  });

  it("finds no cycle in a diamond", () => {
    const bundle = bundleOf(
      chunk("index.js", ["a.js", "b.js"], "", true),
      chunk("a.js", ["c.js"]),
      chunk("b.js", ["c.js"]),
      chunk("c.js", []),
    );
    expect(chunkCycle(bundle, "index.js")).toBeNull();
  });
});
