// @vitest-environment node
/**
 * .dockerignore keeps attached_assets/ (hundreds of MB of source art) out of the
 * image build's context, except the files the app imports. Nothing else in CI
 * builds with .dockerignore applied, so an `@assets/` import without its line
 * there would pass every check here and fail only when the image is built.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SRC = path.join(ROOT, "client", "src");
const lines = fs
  .readFileSync(path.join(ROOT, ".dockerignore"), "utf8")
  .split("\n")
  .map((line) => line.trim());

const kept = new Set(
  lines.filter((line) => line.startsWith("!attached_assets/")).map((line) => line.slice("!attached_assets/".length)),
);

/** Every file under attached_assets/ that a module the build can reach imports. */
function imported(): Set<string> {
  const found = new Set<string>();
  for (const name of fs.readdirSync(SRC, { recursive: true }) as string[]) {
    if (!/\.(tsx?|css)$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
    const text = fs.readFileSync(path.join(SRC, name), "utf8");
    for (const match of text.matchAll(/["']@assets\/([^"'?]+)/g)) found.add(match[1]);
  }
  return found;
}

describe(".dockerignore and attached_assets/", () => {
  it("leaves attached_assets/ out of the build context", () => {
    expect(lines).toContain("attached_assets/**");
  });

  it("lets in every file the app imports from it", () => {
    const missing = [...imported()].filter((file) => !kept.has(file));
    expect(missing, "add `!attached_assets/<file>` to .dockerignore").toEqual([]);
  });

  it("lets in only files that exist", () => {
    for (const file of kept) expect(fs.existsSync(path.join(ROOT, "attached_assets", file)), file).toBe(true);
  });
});
