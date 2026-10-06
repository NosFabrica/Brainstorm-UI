/**
 * The installed app's raster art, drawn from client/public/favicon.svg:
 *
 *   - icons/icon-{192,512}.png       the rounded tile, for "any" (Chrome's install
 *                                    prompt and splash want both sizes)
 *   - icons/maskable-{192,512}.png   full bleed, the mark inside the 80% safe zone,
 *                                    so Android's adaptive mask crops tile, not mark
 *   - apple-touch-icon.png           full bleed: iOS rounds it itself and paints a
 *                                    transparent corner black
 *   - splash/<w>x<h>.png             iOS launch images, one per screen size it
 *                                    matches exactly (index.html links them)
 *
 * Run after changing the favicon or adding a device:  node scripts/pwa-assets.mjs
 * It prints the splash <link> tags for index.html; pwaAssets.test.ts holds the two
 * to each other.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "client", "public");
const SVG = fs.readFileSync(path.join(PUBLIC, "favicon.svg"), "utf8");

/** The launch screen's white: the light theme's first paint. */
const LAUNCH_BACKGROUND = "#ffffff";

/** The mark alone: the favicon with its tile taken away. */
const MARK = SVG.replace(/<rect[^>]*\/>/, "");

/**
 * The favicon with its corner radius dropped, so the tile fills the square. Also
 * the maskable icon: the mark spans ~53% of the tile, inside the 80% safe circle.
 */
const FULL_BLEED = SVG.replace(/\srx="[^"]*"/, "");

/** CSS width × height in portrait, and the pixel ratio — every iPhone and iPad an installed app can open on. */
export const SPLASH_DEVICES = [
  // iPhones
  [440, 956, 3], // 16 Pro Max, 17 Pro Max
  [420, 912, 3], // Air
  [402, 874, 3], // 16 Pro, 17, 17 Pro
  [430, 932, 3], // 14 Pro Max, 15 Plus/Pro Max, 16 Plus
  [393, 852, 3], // 14 Pro, 15, 15 Pro, 16
  [428, 926, 3], // 12/13 Pro Max, 14 Plus
  [390, 844, 3], // 12, 13, 14, 12/13 Pro, 16e
  [375, 812, 3], // X, XS, 11 Pro, 12/13 mini
  [414, 896, 3], // XS Max, 11 Pro Max
  [414, 896, 2], // XR, 11
  [414, 736, 3], // 6+/7+/8 Plus
  [375, 667, 2], // 6/7/8, SE 2nd/3rd
  [320, 568, 2], // SE 1st
  // iPads
  [1032, 1376, 2], // Pro 13" (M4)
  [1024, 1366, 2], // Pro 12.9"
  [834, 1210, 2], // Pro 11" (M4)
  [834, 1194, 2], // Pro 11"
  [820, 1180, 2], // Air 10.9", iPad 10th
  [834, 1112, 2], // Air 3rd, Pro 10.5"
  [810, 1080, 2], // iPad 7th–9th
  [744, 1133, 2], // mini 6th
  [768, 1024, 2], // mini, older iPads
];

async function png(svg, size, out) {
  await sharp(Buffer.from(svg), { density: 72 * (size / 96) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(out);
}

async function splash(width, height, out) {
  // The tile at a quarter of the short side, as a native launch screen sizes its logo.
  const tile = Math.round(Math.min(width, height) * 0.25);
  const logo = await sharp(Buffer.from(SVG), { density: 72 * (tile / 96) })
    .resize(tile, tile)
    .png()
    .toBuffer();
  await sharp({ create: { width, height, channels: 3, background: LAUNCH_BACKGROUND } })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9, palette: true })
    .toFile(out);
}

/** The <link> for one device in one orientation. */
export function splashLink([w, h, dpr], orientation) {
  const [pw, ph] = orientation === "portrait" ? [w * dpr, h * dpr] : [h * dpr, w * dpr];
  const media = `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: ${orientation})`;
  return `<link rel="apple-touch-startup-image" media="${media}" href="/splash/${pw}x${ph}.png" />`;
}

async function main() {
  fs.mkdirSync(path.join(PUBLIC, "icons"), { recursive: true });
  fs.mkdirSync(path.join(PUBLIC, "splash"), { recursive: true });

  for (const size of [192, 512]) {
    await png(SVG, size, path.join(PUBLIC, "icons", `icon-${size}.png`));
    await png(FULL_BLEED, size, path.join(PUBLIC, "icons", `maskable-${size}.png`));
  }
  await png(FULL_BLEED, 180, path.join(PUBLIC, "apple-touch-icon.png"));
  // The notification badge: Android draws only its alpha, tinted, in the status bar.
  await sharp(Buffer.from(MARK), { density: 72 })
    .resize(96, 96)
    .png({ compressionLevel: 9 })
    .toFile(path.join(PUBLIC, "icons", "badge-96.png"));

  const links = [];
  for (const device of SPLASH_DEVICES) {
    const [w, h, dpr] = device;
    await splash(w * dpr, h * dpr, path.join(PUBLIC, "splash", `${w * dpr}x${h * dpr}.png`));
    links.push(splashLink(device, "portrait"));
    // iPads open in either orientation; phones launch the app upright.
    if (w >= 744) {
      await splash(h * dpr, w * dpr, path.join(PUBLIC, "splash", `${h * dpr}x${w * dpr}.png`));
      links.push(splashLink(device, "landscape"));
    }
  }
  console.log(links.join("\n"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
