import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncThemeColor } from "./themeColor";

describe("syncThemeColor", () => {
  const meta = () => document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!;

  beforeEach(() => {
    document.head.querySelector('meta[name="theme-color"]')?.remove();
    const m = document.createElement("meta");
    m.name = "theme-color";
    m.content = "#ffffff";
    document.head.appendChild(m);
  });
  afterEach(() => {
    document.body.style.backgroundColor = "";
  });

  it("paints the status bar the page's own background", () => {
    document.body.style.backgroundColor = "rgb(11, 15, 25)";
    syncThemeColor();
    expect(meta().content).toBe("rgb(11, 15, 25)");
  });

  it("leaves it alone when the body has no background of its own", () => {
    syncThemeColor();
    expect(meta().content).toBe("#ffffff");
  });
});
