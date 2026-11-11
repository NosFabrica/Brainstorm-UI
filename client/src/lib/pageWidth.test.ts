/**
 * The three page widths (decided 2026-11-11): every page's content sits in one
 * of them, centered, with the same gutter. Before this each page chose its own
 * width, and on a wide screen no two neighbours lined up.
 *
 *   wide      1280px  multi-column app pages, and the footer
 *   standard  1024px  info pages, profiles
 *   reading    672px  feeds, a single post, a focused task
 */
import { describe, expect, it } from "vitest";
import { PAGE_WIDTHS, pageWidth, type PageWidth } from "./pageWidth";

// Tailwind's own scale: 7xl is 80rem, 5xl is 64rem, 2xl is 42rem (16px rems).
const CAP: Record<PageWidth, string> = { wide: "max-w-7xl", standard: "max-w-5xl", reading: "max-w-2xl" };

describe("pageWidth", () => {
  it("has exactly three widths", () => {
    expect(Object.keys(PAGE_WIDTHS).sort()).toEqual(["reading", "standard", "wide"]);
  });

  it.each(Object.entries(CAP))("%s is capped at its size", (width, cap) => {
    expect(pageWidth(width as PageWidth).split(" ")).toContain(cap);
  });

  it.each(Object.keys(CAP))("%s is centered, fills what it's given, and has the one gutter", (width) => {
    const classes = pageWidth(width as PageWidth).split(" ");
    expect(classes).toEqual(expect.arrayContaining(["mx-auto", "w-full", "px-4", "sm:px-6"]));
    // Nothing else: a page adds its own vertical rhythm, never another width or gutter.
    expect(classes).toHaveLength(5);
  });
});
