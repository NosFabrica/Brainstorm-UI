// @vitest-environment node
/**
 * No page writes its own width. A content column — centered, capped, with the
 * page gutter — comes from pageWidth(), so there are three widths on the
 * site and not one per page (lib/pageWidth). This reads the source: a column
 * written by hand is the gutter (`px-4 … sm:px-6`) beside `mx-auto` and a
 * `max-w-` cap on one line. A capped block inside a page (a centered
 * paragraph, a card) has no gutter and isn't one.
 */
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [full] : [];
  });
}

const CAP = /(^|[\s"'`])max-w-(lg|xl|[2-7]xl|screen-\w+)(?=[\s"'`]|$)/;
const handWritten = (line: string) =>
  /(^|[\s"'`])mx-auto(?=[\s"'`]|$)/.test(line) &&
  CAP.test(line) &&
  /(^|[\s"'`])px-4(?=[\s"'`]|$)/.test(line) &&
  /(^|[\s"'`])sm:px-6(?=[\s"'`]|$)/.test(line);

describe("page widths", () => {
  it("no page or layout writes its own content column", () => {
    const found = sources(src).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, i) => (handWritten(line) ? [`${path.relative(src, file)}:${i + 1}`] : [])),
    );
    expect(found).toEqual([]);
  });

  it("knows a hand-written column from a capped block inside a page", () => {
    expect(handWritten('<main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">')).toBe(true);
    expect(handWritten('<p className="mx-auto mt-3 max-w-lg text-base">')).toBe(false);
    expect(handWritten('<Card className="mx-auto mt-4 flex w-full max-w-3xl items-center gap-3 px-4 py-3">')).toBe(
      false,
    );
    expect(handWritten('<main className={cn(pageWidth("reading"), "flex-1 py-8")}>')).toBe(false);
  });
});
