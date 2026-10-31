/**
 * "Built on Brainstorm", the line apps built on Brainstorm carry at their foot: the element
 * each app copies (client/public/built-on/built-on-brainstorm.js) and the look every copy loads
 * (client/public/built-on/v1.css). docs/built-on-brainstorm.md is the contract these hold
 * them to.
 *
 * The element is run from its file as a plain script, as a page with a classic <script> runs
 * it: it has no imports or exports, and an app's bundler and a page's script tag both take it
 * as it is. It lives under client/src/test because that is the only tree vitest includes.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { BrainLogo } from "@/components/BrainLogo";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ELEMENT = path.join(ROOT, "client/public/built-on/built-on-brainstorm.js");

/** Runs the element's file, as a page's script tag would. */
const runElement = () => new Function(fs.readFileSync(ELEMENT, "utf8"))();

/**
 * Whether `css` underlines and darkens the link on hover only where a pointer can hover: on a phone a
 * tap leaves :hover set, and the line would stay dark after the person comes back from the new tab.
 * Focus is outside the media query, since a keyboard focuses on every device.
 */
function hoversOnlyWhereAPointerCan(css: string) {
  const media = /@media\s*\(hover:\s*hover\)\s*\{\s*a:hover\s*\{[^{}]*\}\s*\}/;
  expect(css).toMatch(media);
  const outside = css.replace(media, "");
  expect(outside).not.toContain(":hover");
  expect(outside).toMatch(/a:focus-visible\s*\{[^}]*text-decoration:\s*underline/);
}

/** A line on the page, with `attributes` set before it is connected. */
function line(attributes: Record<string, string> = {}) {
  const host = document.createElement("built-on-brainstorm");
  for (const [name, value] of Object.entries(attributes)) host.setAttribute(name, value);
  document.body.append(host);
  const root = host.shadowRoot!;
  return { host, root, link: root.querySelector("a")! };
}

describe("the element", () => {
  beforeAll(runElement);
  afterEach(() => document.body.replaceChildren());

  it("is one link to brainstorm.world, in a new tab, that tells it nothing", () => {
    const { root, link } = line();
    expect(root.querySelectorAll("a")).toHaveLength(1);
    expect(link).toHaveAttribute("href", "https://brainstorm.world");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("part", "link");
  });

  it("says Built on Brainstorm, and to a screen reader that it opens in a new tab", () => {
    const { link } = line();
    // Named by its label, so every browser gives the same name: the words, then the hint.
    expect(link).toHaveAttribute("aria-label", "Built on Brainstorm (opens in a new tab)");
    expect(link).toHaveAccessibleName("Built on Brainstorm (opens in a new tab)");
    expect(link.querySelector('[part="words"]')).toHaveTextContent(/^Built on Brainstorm$/);
    expect(link).toHaveTextContent(/^Built on Brainstorm$/);
  });

  it("draws BrainLogo's mono mark before the words, hidden from a screen reader", () => {
    const { link } = line();
    const mark = link.firstElementChild!;
    expect(mark.tagName.toLowerCase()).toBe("svg");
    expect(mark).toHaveAttribute("part", "mark");
    expect(mark).toHaveAttribute("viewBox", "0 0 71 73");
    expect(mark).toHaveAttribute("fill", "currentColor");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark).toHaveAttribute("focusable", "false");
    // Its size in the markup too, the look's own, so with no stylesheet at all it is never drawn at the page's width.
    expect(mark).toHaveAttribute("width", "1.05em");
    expect(mark).toHaveAttribute("height", "1.08em");
    expect(mark.children).toHaveLength(1);
    const d = mark.querySelector("path")!.getAttribute("d")!;
    const { container } = render(<BrainLogo mono />);
    expect(d).toBe(container.querySelector("path")!.getAttribute("d"));
    expect(d).toHaveLength(2280);
    expect(createHash("sha256").update(d).digest("hex")).toBe(
      "1cb58d464345120ce16678221fff92cb0f3f3dea709145d6c350143f0695b9f4",
    );
  });

  it("loads the shared look from brainstorm.world, with no referrer and no cookies", () => {
    const { root, link } = line();
    const sheet = root.querySelector('link[rel="stylesheet"]')!;
    expect(sheet).toHaveAttribute("href", "https://brainstorm.world/built-on/v1.css");
    expect(sheet).toHaveAttribute("crossorigin", "anonymous");
    expect(sheet).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(sheet.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("loads another copy of the look when told to", () => {
    const { host, root } = line({ stylesheet: "./v1.css" });
    const sheet = root.querySelector('link[rel="stylesheet"]')!;
    expect(sheet).toHaveAttribute("href", "./v1.css");
    host.setAttribute("stylesheet", "/x.css");
    expect(sheet).toHaveAttribute("href", "/x.css");
    host.removeAttribute("stylesheet");
    expect(sheet).toHaveAttribute("href", "https://brainstorm.world/built-on/v1.css");
  });

  it("asks for one stylesheet only: a line on the page told to load another copy never names brainstorm.world's", () => {
    // A line the page already holds when the element is defined is upgraded with its attribute,
    // and is connected throughout: a stylesheet link's href is fetched the moment it is set.
    const named: string[] = [];
    const setAttribute = Element.prototype.setAttribute;
    const spy = vi.spyOn(Element.prototype, "setAttribute").mockImplementation(function (this: Element, name, value) {
      if (this.localName === "link" && name === "href") named.push(value);
      return setAttribute.call(this, name, value);
    });
    try {
      document.body.innerHTML =
        '<built-on-brainstorm stylesheet="./v1.css"></built-on-brainstorm><built-on-brainstorm></built-on-brainstorm>';
    } finally {
      spy.mockRestore();
    }
    expect(named).toEqual(["./v1.css", "https://brainstorm.world/built-on/v1.css"]);
  });

  it("carries the launch look in a layer the shared look wins over", () => {
    // jsdom cannot adopt a stylesheet, so the element writes its own look into a <style>.
    const { root } = line();
    const own = root.querySelector("style")!;
    const sheet = root.querySelector('link[rel="stylesheet"]')!;
    expect(own.compareDocumentPosition(sheet) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(own.textContent!.trim()).toMatch(/^@layer built-on-baseline \{/);
    for (const hook of ["--built-on-color", "--built-on-hover-color", "--built-on-focus-color"])
      expect(own.textContent).toContain(`var(${hook}`);
  });

  it("does nothing where there is no DOM, as when a server renders the app", () => {
    const source = fs.readFileSync(ELEMENT, "utf8");
    const noDom = new Function("customElements", "HTMLElement", "ShadowRoot", "CSSStyleSheet", "document", source);
    expect(() => noDom(undefined, undefined, undefined, undefined, undefined)).not.toThrow();
  });

  it("underlines and darkens on hover only where a pointer can hover, and on keyboard focus everywhere", () => {
    const { root } = line();
    hoversOnlyWhereAPointerCan(root.querySelector("style")!.textContent!);
  });

  it("can be defined twice without throwing", () => {
    const first = customElements.get("built-on-brainstorm");
    expect(first).toBeDefined();
    expect(runElement).not.toThrow();
    expect(customElements.get("built-on-brainstorm")).toBe(first);
  });
});

describe("the shared look", () => {
  /** v1.css as a browser reads it: its comments are no part of it. */
  const css = fs
    .readFileSync(path.join(ROOT, "client/public/built-on/v1.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  it("asks for nothing: no import, no font, no address but a data: one", () => {
    expect(css).not.toMatch(/@import/i);
    expect(css).not.toMatch(/@font-face/i);
    for (const [, target] of css.matchAll(/url\(\s*(['"]?[^)]*)\)/gi)) expect(target).toMatch(/^['"]?data:/i);
  });

  it("is unlayered, so it wins over the element's own look", () => {
    expect(css).not.toMatch(/@layer/i);
  });

  it("underlines and darkens on hover only where a pointer can hover, and on keyboard focus everywhere", () => {
    hoversOnlyWhereAPointerCan(css);
  });

  it("honours the hooks apps set", () => {
    expect(css).toContain(":host");
    for (const hook of ["--built-on-color", "--built-on-hover-color", "--built-on-focus-color"])
      expect(css).toContain(`var(${hook}`);
  });
});
