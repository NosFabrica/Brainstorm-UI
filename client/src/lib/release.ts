/**
 * A software release (kind 30063) and its files, read in the two shapes that
 * define the kind:
 *
 * - **NIP-51 "release artifact set"**: `e` tags naming kind-1063 file
 *   metadata (NIP-94), and an `a` naming the software application (32267).
 *   NIP-51 says nothing more; the `d` is the set's identifier.
 * - **NIP-82 "software release"** (draft, nostr-protocol/nips#2526):
 *   `["i", <app-id>]` (the app's `d`), `["version", …]`, `["d", "<app-id>@<version>"]`,
 *   `["c", <channel>]`, `["f", <platform>]…`, and `e` tags naming kind-3063
 *   software assets (an extension of 1063). It carries no `a`: the app is the
 *   32267 whose `d` is the `i`, by the same publisher. The content is the
 *   release notes, markdown.
 *
 * A release with `i` and `version` (NIP-82's required pair) is read as NIP-82;
 * anything else as NIP-51.
 *
 * A file is read by its kind's tags. NIP-94 (1063): `url`, `m`, `x`, `size`,
 * `summary`, `alt` and the content as caption; it has no name, platform or
 * version. NIP-82 (3063) adds `f` platforms, `version`, `variant`,
 * `filename` and `min_platform_version`, and several `url`s.
 */
export const RELEASE_KIND = 30063;
export const FILE_METADATA_KIND = 1063;
export const SOFTWARE_ASSET_KIND = 3063;
export const APP_KIND = 32267;

const HEX64 = /^[0-9a-f]{64}$/i;

export interface Release {
  shape: "nip82" | "nip51";
  /**
   * The app's address, `32267:<pubkey>:<d>`: NIP-82's `i` under the publisher, or
   * NIP-51's `a` when the app is the release's signer's. A release is the app's only
   * from the app's own publisher: anyone can sign a 30063 naming any app.
   */
  app: { address: string; relay?: string } | null;
  /**
   * An `a` naming someone else's app: what the release says it is a release of,
   * unproven. Never read as `app` (its name in the title, its files as that app's).
   */
  claimedApp: { address: string; relay?: string } | null;
  /** NIP-82's `version`; NIP-51 names none. */
  version: string | null;
  /** The release's `d`. */
  identifier: string;
  /** NIP-82's `c`: main, beta, nightly, dev, or the publisher's own. */
  channel: string | null;
  /** NIP-82's `f`: the union of its assets' platforms. */
  platforms: string[];
  /** The files: 1063s (NIP-51) or 3063s (NIP-82), with the `e`'s relay hint. */
  assets: { id: string; relay?: string }[];
  /** Release notes, markdown. */
  notes: string;
}

const tag = (tags: string[][], name: string) => tags.find((t) => t[0] === name)?.[1]?.trim() || null;
const relayOf = (t: string[]) => (t[2] && /^wss?:\/\//i.test(t[2]) ? t[2] : undefined);

export function readRelease(ev: { pubkey: string; tags: string[][]; content: string }): Release {
  const appId = tag(ev.tags, "i");
  const version = tag(ev.tags, "version");
  const nip82 = !!appId && !!version;
  const appTag = ev.tags.find((t) => t[0] === "a" && t[1]?.startsWith(`${APP_KIND}:`));
  const assets: Release["assets"] = [];
  const seen = new Set<string>();
  for (const t of ev.tags) {
    if (t[0] !== "e" || !HEX64.test(t[1] ?? "") || seen.has(t[1].toLowerCase())) continue;
    seen.add(t[1].toLowerCase());
    const relay = relayOf(t);
    assets.push({ id: t[1].toLowerCase(), ...(relay ? { relay } : {}) });
  }
  const tagged = appTag ? { address: appTag[1], ...(relayOf(appTag) ? { relay: relayOf(appTag) } : {}) } : null;
  const own = !!appTag && appTag[1].split(":")[1]?.toLowerCase() === ev.pubkey.toLowerCase();
  return {
    shape: nip82 ? "nip82" : "nip51",
    app: nip82 ? { address: `${APP_KIND}:${ev.pubkey}:${appId}` } : own ? tagged : null,
    claimedApp: !nip82 && !own ? tagged : null,
    version: nip82 ? version : null,
    identifier: tag(ev.tags, "d") ?? "",
    channel: nip82 ? tag(ev.tags, "c") : null,
    platforms: nip82 ? [...new Set(ev.tags.filter((t) => t[0] === "f" && t[1]?.trim()).map((t) => t[1].trim()))] : [],
    assets,
    notes: ev.content.trim(),
  };
}

/** What the release is called: "1.2.3" (NIP-82), else its `d`. */
export function releaseName(r: Release): string {
  return r.version ?? (r.identifier || "Release");
}

export interface ReleaseAssetFile {
  kind: number;
  /** What tells it from its siblings: NIP-82's `variant` or `filename`; NIP-94's `alt`, `summary` or caption. */
  name: string | null;
  mime: string | null;
  size: number | null;
  /** A download address, web only. */
  url: string | null;
  hash: string | null;
  /** NIP-82's `f`; NIP-94 has none. */
  platforms: string[];
  /** NIP-82's `version`; NIP-94 has none. */
  version: string | null;
  /** NIP-82's `min_platform_version`. */
  minPlatformVersion: string | null;
}

export function readReleaseAsset(ev: { kind: number; tags: string[][]; content: string }): ReleaseAssetFile {
  const asset = ev.kind === SOFTWARE_ASSET_KIND;
  const sizeRaw = tag(ev.tags, "size");
  const size = sizeRaw && /^\d+$/.test(sizeRaw) && Number(sizeRaw) > 0 ? Number(sizeRaw) : null;
  const url = ev.tags
    .filter((t) => t[0] === "url")
    .map((t) => t[1]?.trim() ?? "")
    .find((u) => /^https?:\/\//i.test(u));
  return {
    kind: ev.kind,
    name: asset
      ? (tag(ev.tags, "variant") ?? tag(ev.tags, "filename"))
      : (tag(ev.tags, "alt") ?? tag(ev.tags, "summary") ?? (ev.content.trim() || null)),
    mime: tag(ev.tags, "m")?.toLowerCase() ?? null,
    size,
    url: url ?? null,
    hash: tag(ev.tags, "x"),
    platforms: asset ? [...new Set(ev.tags.filter((t) => t[0] === "f" && t[1]?.trim()).map((t) => t[1].trim()))] : [],
    version: asset ? tag(ev.tags, "version") : null,
    minPlatformVersion: asset ? tag(ev.tags, "min_platform_version") : null,
  };
}

/** NIP-82 Appendix C: the runtime a MIME type implies, for the types it lists. */
const RUNTIMES: Record<string, string> = {
  "application/vnd.android.package-archive": "Android",
  "application/vnd.apple.ipa": "iOS",
  "application/x-apple-diskimage": "macOS",
  "application/vnd.apple.installer+xml": "macOS",
  "application/x-msi": "Windows",
  "application/vnd.appimage": "Linux",
  "application/vnd.flatpak": "Linux (Flatpak)",
  "application/vnd.oci.image.manifest.v1+json": "OCI",
  "application/x-executable": "Linux",
  "application/x-mach-binary": "macOS",
  "application/vnd.microsoft.portable-executable": "Windows",
  "application/vsix": "VS Code",
  "application/x-chrome-extension": "Chrome",
  "application/x-xpinstall": "Firefox",
  "application/wasm": "WebAssembly",
  "application/webbundle": "Web",
};

export function runtimeOf(mime: string | null): string | null {
  return mime ? (RUNTIMES[mime] ?? null) : null;
}

/** NIP-82 Appendix A: a platform id in words, "android-arm64-v8a" → "Android ARMv8-A". */
const PLATFORMS: Record<string, string> = {
  "android-arm64-v8a": "Android ARMv8-A",
  "android-armeabi-v7a": "Android ARMv7-A",
  "android-x86": "Android x86",
  "android-x86_64": "Android x86-64",
  "darwin-arm64": "macOS ARM64",
  "darwin-x86_64": "macOS x86-64",
  "linux-aarch64": "Linux ARM64",
  "linux-x86_64": "Linux x86-64",
  "linux-armv7l": "Linux ARMv7",
  "linux-riscv64": "Linux RISC-V",
  "windows-aarch64": "Windows ARM64",
  "windows-x86_64": "Windows x86-64",
  "ios-arm64": "iOS ARM64",
  "freebsd-x86_64": "FreeBSD x86-64",
  "freebsd-aarch64": "FreeBSD ARM64",
  wasm32: "WebAssembly 32-bit",
  wasm64: "WebAssembly 64-bit",
  "wasi-wasm32": "WASI 32-bit",
  "wasi-wasm64": "WASI 64-bit",
};

export function platformLabel(id: string): string {
  return PLATFORMS[id] ?? id;
}

/** The operating systems a list of platforms covers, once each: "Android, macOS". */
export function platformFamilies(ids: string[]): string[] {
  return [...new Set(ids.map((id) => platformLabel(id).split(" ")[0]))];
}
