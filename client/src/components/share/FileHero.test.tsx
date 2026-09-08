/**
 * A kind-1063 file (NIP-94) opened on its page read as a bare note —
 * "com.vitorpamplona.amethyst@1.05.1" under a stray rule (2026-09-07). Zap
 * Store publishes one per Amethyst release: an Android installer, 44 MB, on
 * GitHub. The page says what the file is and offers it.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import { FileHero } from "./FileHero";

const apk = {
  id: "1".repeat(64),
  kind: 1063,
  pubkey: "a".repeat(64),
  created_at: 1_767_830_400,
  sig: "s",
  content: "com.vitorpamplona.amethyst@1.05.1",
  tags: [
    ["f", "android-arm64-v8a"],
    ["version", "1.05.1"],
    ["version_code", "10501"],
    ["m", "application/vnd.android.package-archive"],
    ["x", "cbb49d834143aa9047325603dacd4f8142093567973566de3b1e20a89557b728"],
    ["size", "45839275"],
    ["url", "https://github.com/vitorpamplona/amethyst/releases/download/v1.05.1/amethyst-googleplay-arm64-v8a-v1.05.1.apk"],
  ],
} as NostrEvent;

describe("FileHero", () => {
  it("an Android installer says what it is — name, version, kind, size — and offers the download", () => {
    render(<FileHero event={apk} />);
    const hero = screen.getByTestId("file-hero");
    expect(hero).toHaveTextContent("com.vitorpamplona.amethyst");
    expect(hero).toHaveTextContent("Android app");
    expect(hero).toHaveTextContent("v1.05.1");
    expect(hero).toHaveTextContent("43.7 MB");
    expect(hero).not.toHaveTextContent("@1.05.1");
    const link = screen.getByTestId("file-hero-download");
    expect(link).toHaveAttribute("href", apk.tags.find((t) => t[0] === "url")![1]);
    expect(link).toHaveAttribute("download");
    expect(link).toHaveTextContent("Download APK");
    expect(link.getAttribute("title")).toMatch(/SHA-256 cbb49d83/);
  });

  it("any other file names its type from the mime and its file name from the link", () => {
    const pdf = { ...apk, content: "", tags: [["m", "application/pdf"], ["size", "2048"], ["url", "https://files.example/papers/bitcoin.pdf"]] } as NostrEvent;
    render(<FileHero event={pdf} />);
    const hero = screen.getByTestId("file-hero");
    expect(hero).toHaveTextContent("bitcoin.pdf");
    expect(hero).toHaveTextContent("PDF");
    expect(hero).toHaveTextContent("2 KB");
    expect(screen.getByTestId("file-hero-download")).toHaveTextContent("Download");
  });
});
