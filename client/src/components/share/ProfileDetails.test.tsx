/**
 * The facts a public profile states about itself — website, lightning
 * target, linked accounts — as readable rows under the bio. They used to
 * be icon-only glyphs top-right; a power user (2026-09-05) could not find
 * the lightning icon, and when they did it opened a zap flow when they
 * wanted to copy the address. Now: tap the address to copy it; "Zap"
 * beside it pays.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ExternalIdentity } from "@/lib/externalIdentity";

const copyMock = vi.fn(async (_text: string) => true);
vi.mock("@/lib/clipboard", () => ({ copyToClipboard: (text: string) => copyMock(text) }));

import { ProfileDetails } from "@/components/share/ProfileDetails";

const LNURL = "lnurl1dp68gurn8ghj7um9wfmxjcm99e3k7mf0v9cxj0m385ekvcenxc6r2c35xvukxefcv5mkvv34x5ekzd3ev56nyd3hxqurzepexejxxepnxscrvwfnv9nxzcn9xq6xyefhvgcxxcmyxymnserxfq5fns";

describe("ProfileDetails", () => {
  beforeEach(() => {
    copyMock.mockReset();
    copyMock.mockResolvedValue(true);
  });

  it("with nothing to say, says nothing", () => {
    const { container } = render(<ProfileDetails />);
    expect(container).toBeEmptyDOMElement();
  });

  it("the website reads as its domain and opens in a new tab", () => {
    render(<ProfileDetails website="megistus.xyz" />);
    const link = screen.getByTestId("share-website");
    expect(link).toHaveTextContent("megistus.xyz");
    expect(link).toHaveAttribute("href", "https://megistus.xyz");
    expect(link).toHaveAttribute("title", "https://megistus.xyz");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("every listed website gets its own row", () => {
    render(<ProfileDetails website="https://a.com b.org" />);
    expect(screen.getAllByTestId("share-website").map((l) => l.textContent)).toEqual(["a.com", "b.org"]);
  });

  it("a tap on the lightning address copies it and says so", async () => {
    render(<ProfileDetails lud16="megistus@primal.net" />);
    const row = screen.getByTestId("share-lightning");
    expect(row).toHaveTextContent("megistus@primal.net");
    expect(row).toHaveAttribute("aria-label", "Copy lightning address");
    fireEvent.click(row);
    expect(copyMock).toHaveBeenCalledWith("megistus@primal.net");
    await waitFor(() => expect(screen.getByTestId("share-lightning-copied")).toHaveTextContent("Copied"));
  });

  it("an LNURL shows shortened, copies whole, and offers no zap", () => {
    render(<ProfileDetails lud06={LNURL} onZap={() => {}} />);
    const row = screen.getByTestId("share-lightning");
    expect(row).toHaveTextContent(`${LNURL.slice(0, 12)}…${LNURL.slice(-6)}`);
    fireEvent.click(row);
    expect(copyMock).toHaveBeenCalledWith(LNURL);
    expect(screen.queryByTestId("share-lightning-zap")).toBeNull();
  });

  it("Zap pays through the caller's flow and never copies", () => {
    const onZap = vi.fn();
    render(<ProfileDetails lud16="megistus@primal.net" onZap={onZap} />);
    fireEvent.click(screen.getByTestId("share-lightning-zap"));
    expect(onZap).toHaveBeenCalledTimes(1);
    expect(copyMock).not.toHaveBeenCalled();
  });

  it("without a zap flow there is no Zap", () => {
    render(<ProfileDetails lud16="megistus@primal.net" />);
    expect(screen.queryByTestId("share-lightning-zap")).toBeNull();
  });

  it("linked accounts read as platform and handle; a linkable one is a link", () => {
    const identities: ExternalIdentity[] = [
      { platform: "github", identity: "alice", label: "GitHub", icon: "github", url: "https://github.com/alice" },
      { platform: "telegram", identity: "12345", label: "Telegram", icon: "telegram" },
    ];
    render(<ProfileDetails identities={identities} />);
    const rows = screen.getAllByTestId("profile-identity");
    expect(rows).toHaveLength(2);
    expect(rows[0].tagName).toBe("A");
    expect(rows[0]).toHaveAttribute("href", "https://github.com/alice");
    expect(rows[0]).toHaveTextContent("GitHub · alice");
    expect(rows[1].tagName).toBe("SPAN");
    expect(rows[1]).toHaveTextContent("Telegram · 12345");
  });

  it("no linked accounts, no wrapper for them", () => {
    render(<ProfileDetails website="a.com" identities={[]} />);
    expect(screen.queryByTestId("share-identities")).toBeNull();
  });
});
