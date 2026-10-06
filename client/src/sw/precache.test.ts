import { describe, expect, it } from "vitest";
import { precacheLists, type BuiltFile } from "./precache";

const chunk = (fileName: string, extra: Partial<BuiltFile> = {}): BuiltFile => ({ type: "chunk", fileName, ...extra });
const asset = (fileName: string): BuiltFile => ({ type: "asset", fileName });

function bundle(files: BuiltFile[]): Record<string, BuiltFile> {
  return Object.fromEntries(files.map((f) => [f.fileName, f]));
}

const BUILD = bundle([
  chunk("assets/index.js", {
    isEntry: true,
    imports: ["assets/vendor.js"],
    viteMetadata: { importedCss: new Set(["assets/index.css"]) },
  }),
  chunk("assets/vendor.js"),
  asset("assets/index.css"),
  chunk("assets/MessagesPage.js", {
    isDynamicEntry: true,
    facadeModuleId: "/app/client/src/pages/MessagesPage.tsx",
    imports: ["assets/vendor.js", "assets/chat.js"],
    viteMetadata: { importedCss: new Set(["assets/MessagesPage.css"]) },
  }),
  chunk("assets/chat.js"),
  asset("assets/MessagesPage.css"),
  chunk("assets/AdminPage.js", { isDynamicEntry: true, facadeModuleId: "/app/client/src/pages/AdminPage.tsx" }),
  asset("assets/figtree-latin-wght-normal-abc.woff2"),
  asset("assets/figtree-latin-ext-wght-normal-abc.woff2"),
  asset("assets/ibm-plex-mono-cyrillic-400-normal-abc.woff2"),
  asset("assets/hero.webp"),
]);

describe("precacheLists", () => {
  it("keeps the entry with everything it imports, its CSS and the Latin fonts as the shell", () => {
    expect(precacheLists(BUILD, ["MessagesPage"]).shell).toEqual([
      "assets/figtree-latin-wght-normal-abc.woff2",
      "assets/index.css",
      "assets/index.js",
      "assets/vendor.js",
    ]);
  });

  it("keeps the named screens apart, without what the shell already holds", () => {
    const { routes } = precacheLists(BUILD, ["MessagesPage"]);
    expect(routes).toEqual(["assets/MessagesPage.css", "assets/MessagesPage.js", "assets/chat.js"]);
    expect(routes).not.toContain("assets/AdminPage.js");
  });

  it("names a screen the build has no chunk for, so a rename can't drop it silently", () => {
    expect(precacheLists(BUILD, ["MessagesPage", "GonePage"]).missing).toEqual(["GonePage"]);
  });
});
