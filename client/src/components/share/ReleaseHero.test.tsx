// @vitest-environment jsdom
/**
 * A software release (kind 30063) opened as the structural tag table. It now
 * reads as a release in either shape that defines the kind: NIP-51's artifact
 * set (1063 file metadata, the app by `a`) and NIP-82's software release
 * (3063 assets, the app by `i`, a version, a channel, platforms).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { MinimalEvent } from "@/lib/noteRefs";

const byId = new Map<string, MinimalEvent>();
const byAddress = new Map<string, MinimalEvent>();
const askedRelays: string[][] = [];
vi.mock("@/services/nostr", async () => ({
  ...(await import("@/test/fakeNostr")).nostrReadDefaults,
  fetchEventsByIds: async (ids: string[], relays: string[]) => {
    askedRelays.push(relays);
    return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  },
  fetchAddressableEvents: async (refs: { kind: number; pubkey: string; identifier: string }[]) =>
    new Map(
      refs.flatMap((r) => {
        const key = `${r.kind}:${r.pubkey}:${r.identifier}`;
        return byAddress.has(key) ? [[key, byAddress.get(key)!]] : [];
      }),
    ),
}));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/hooks/useNip05", () => ({ useNip05: () => "none" }));

import { ReleaseHero } from "./ReleaseHero";

const DEV = "d".repeat(64);
let n = 500;
const ev = (kind: number, tags: string[][], content = ""): MinimalEvent => ({
  id: (++n).toString(16).padStart(64, "0"),
  kind,
  pubkey: DEV,
  created_at: 1_790_000_000,
  tags,
  content,
});

beforeEach(() => {
  byId.clear();
  byAddress.clear();
  askedRelays.length = 0;
});

describe("ReleaseHero", () => {
  it("NIP-82: the app from `i`, version, channel, platforms, and each 3063 asset with its size and download", async () => {
    const app = ev(32267, [
      ["d", "com.example.app"],
      ["name", "Example"],
    ]);
    byAddress.set(`32267:${DEV}:com.example.app`, app);
    const apk = ev(3063, [
      ["i", "com.example.app"],
      ["x", "e".repeat(64)],
      ["version", "1.2.3"],
      ["m", "application/vnd.android.package-archive"],
      ["f", "android-arm64-v8a"],
      ["url", "https://cdn.example/app.apk"],
      ["size", "12582912"],
      ["variant", "fdroid"],
    ]);
    byId.set(apk.id, apk);
    renderWithProviders(
      <ReleaseHero
        event={ev(
          30063,
          [
            ["i", "com.example.app"],
            ["version", "1.2.3"],
            ["d", "com.example.app@1.2.3"],
            ["c", "beta"],
            ["f", "android-arm64-v8a"],
            ["e", apk.id, "wss://relay.zapstore.dev"],
          ],
          "## What's new\n- Faster",
        )}
      />,
    );
    expect(await screen.findByTestId("release-title")).toHaveTextContent("Example 1.2.3");
    expect(screen.getByTestId("release-channel")).toHaveTextContent("beta");
    expect(screen.getByTestId("release-facts")).toHaveTextContent("Android ARMv8-A");
    const row = await screen.findByTestId(`release-asset-${apk.id}`);
    expect(row).toHaveTextContent("fdroid");
    expect(within(row).getByTestId("release-asset-facts")).toHaveTextContent("Android · 12 MB · v1.2.3");
    expect(within(row).getByTestId("release-asset-download")).toHaveAttribute("href", "https://cdn.example/app.apk");
    expect(screen.getByTestId("release-notes")).toHaveTextContent("Faster");
    // The files are asked where they live: the release's hint and the Zap Store relay.
    expect(askedRelays.flat()).toEqual(
      expect.arrayContaining(["wss://relay.zapstore.dev", "wss://relay.zapstore.dev/"]),
    );
  });

  it("NIP-51: the app from `a`, a 1063 read by NIP-94's tags alone — no version or platform it does not define", async () => {
    const app = ev(32267, [
      ["d", "org.other"],
      ["name", "Other"],
    ]);
    byAddress.set(`32267:${DEV}:org.other`, app);
    const exe = ev(1063, [
      ["url", "https://cdn.example/other.exe"],
      ["m", "application/vnd.microsoft.portable-executable"],
      ["x", "f".repeat(64)],
      ["size", "2048"],
      ["alt", "Windows installer"],
      ["version", "9.9"],
      ["f", "windows-x86_64"],
    ]);
    byId.set(exe.id, exe);
    renderWithProviders(
      <ReleaseHero
        event={ev(30063, [
          ["d", "org.other@0.0.1"],
          ["e", exe.id],
          ["a", `32267:${DEV}:org.other`],
        ])}
      />,
    );
    expect(await screen.findByTestId("release-title")).toHaveTextContent("Other org.other@0.0.1");
    expect(screen.queryByTestId("release-channel")).toBeNull();
    const row = await screen.findByTestId(`release-asset-${exe.id}`);
    expect(row).toHaveTextContent("Windows installer");
    expect(within(row).getByTestId("release-asset-facts")).toHaveTextContent("Windows · 2 KB");
    expect(row).not.toHaveTextContent("9.9");
    expect(row).not.toHaveTextContent("x86-64");
    expect(await screen.findByTestId("embedded-card")).toHaveAttribute("data-shape", "app");
  });

  it("says when its files were not found", async () => {
    renderWithProviders(
      <ReleaseHero
        event={ev(30063, [
          ["d", "x@1"],
          ["e", "9".repeat(64)],
        ])}
      />,
    );
    expect(await screen.findByTestId("release-assets-missing")).toHaveTextContent("weren't found");
  });

  it("a release naming someone else's app is not that app's: it only claims to be, and says so", async () => {
    const MAKER = "1".repeat(64);
    const app = {
      ...ev(32267, [
        ["d", "com.popular"],
        ["name", "Popular"],
      ]),
      pubkey: MAKER,
    };
    byAddress.set(`32267:${MAKER}:com.popular`, app);
    renderWithProviders(
      <ReleaseHero
        event={ev(30063, [
          ["d", "com.popular@9.9"],
          ["a", `32267:${MAKER}:com.popular`],
        ])}
      />,
    );
    expect(await screen.findByTestId("release-claimed-app")).toHaveTextContent(/claims to be a release of Popular/i);
    expect(screen.getByTestId("release-title")).not.toHaveTextContent("Popular");
  });
});
