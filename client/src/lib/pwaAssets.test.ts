/**
 * The installed app's static parts hold together: the manifest names files that
 * exist at the sizes it claims and routes the app has, and every iOS launch
 * image index.html links matches the screen its media query picks
 * (scripts/pwa-assets.mjs draws them).
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..", "..");
const PUBLIC = path.join(ROOT, "client", "public");
const INDEX = fs.readFileSync(path.join(ROOT, "client", "index.html"), "utf8");
const APP = fs.readFileSync(path.join(ROOT, "client", "src", "App.tsx"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(PUBLIC, "site.webmanifest"), "utf8"));

/** Width × height from a PNG's IHDR, or a WebP's VP8/VP8L/VP8X header. */
function dimensions(file: string): [number, number] {
  const b = fs.readFileSync(path.join(PUBLIC, file));
  if (b.toString("ascii", 1, 4) === "PNG") return [b.readUInt32BE(16), b.readUInt32BE(20)];
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
  }
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
}

const routeExists = (url: string) => {
  const pathname = new URL(url, "https://x").pathname;
  return pathname === "/" || APP.includes(`path="${pathname}"`);
};

describe("the web app manifest", () => {
  it("is installable: a name that fits under an icon, standalone, in scope", () => {
    expect(manifest.id).toBe("/");
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
  });

  it("has every icon it names, at the size it claims, maskable included", () => {
    const purposes = new Set<string>();
    for (const icon of manifest.icons) {
      expect(fs.existsSync(path.join(PUBLIC, icon.src)), icon.src).toBe(true);
      purposes.add(`${icon.sizes}/${icon.purpose}`);
      if (icon.type === "image/png") expect(dimensions(icon.src).join("x")).toBe(icon.sizes);
    }
    for (const needed of ["192x192/any", "512x512/any", "192x192/maskable", "512x512/maskable"])
      expect(purposes, needed).toContain(needed);
  });

  it("has its screenshots, at the size it claims", () => {
    for (const shot of manifest.screenshots) expect(dimensions(shot.src).join("x"), shot.src).toBe(shot.sizes);
  });

  it("sends shortcuts, shares and web+nostr: links to routes the app has", () => {
    for (const shortcut of manifest.shortcuts) expect(routeExists(shortcut.url), shortcut.url).toBe(true);
    expect(routeExists(manifest.share_target.action)).toBe(true);
    for (const handler of manifest.protocol_handlers) {
      expect(handler.protocol.startsWith("web+")).toBe(true);
      expect(handler.url).toContain("%s");
      expect(routeExists(handler.url)).toBe(true);
    }
  });
});

describe("index.html", () => {
  it("has a launch image for every screen it links one for, at that screen's size", () => {
    const links = [...INDEX.matchAll(/<link\s+rel="apple-touch-startup-image"\s+media="([^"]+)"\s+href="([^"]+)"/g)];
    expect(links.length).toBeGreaterThan(10);
    for (const [, media, href] of links) {
      const w = Number(/device-width: (\d+)px/.exec(media)![1]);
      const h = Number(/device-height: (\d+)px/.exec(media)![1]);
      const dpr = Number(/pixel-ratio: (\d+)/.exec(media)![1]);
      const landscape = media.includes("orientation: landscape");
      const expected = landscape ? [h * dpr, w * dpr] : [w * dpr, h * dpr];
      expect(dimensions(href), href).toEqual(expected);
    }
  });

  it("names the theme colour before the theme script that darkens it", () => {
    const meta = INDEX.indexOf('<meta name="theme-color"');
    expect(meta).toBeGreaterThan(-1);
    expect(meta).toBeLessThan(INDEX.indexOf('localStorage.getItem("brainstorm_theme")'));
  });

  it("links an opaque Apple icon: iOS paints a transparent corner black", async () => {
    expect(INDEX).toContain('<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />');
    expect(dimensions("apple-touch-icon.png")).toEqual([180, 180]);
    const { isOpaque } = await sharp(path.join(PUBLIC, "apple-touch-icon.png")).stats();
    expect(isOpaque).toBe(true);
  });
});
