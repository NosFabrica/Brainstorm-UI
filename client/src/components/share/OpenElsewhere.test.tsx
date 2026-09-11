/**
 * The article page's not-found state offered one "Try opening in an app"
 * button that, on a desktop, opened Nostria's HOMEPAGE — not the article
 * (Benjamin, 2026-09-09: "this should be fixed"). The state now offers the
 * same clients the ⋯ menu does, each verified to render the kind.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { nip19 } from "nostr-tools";
import { OpenElsewhere } from "./OpenElsewhere";

const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124.0 Safari/537.36";
const PIXEL = "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/124.0 Mobile Safari/537.36";
const naddr = nip19.naddrEncode({ kind: 30023, pubkey: "a".repeat(64), identifier: "hello" });
const article = { kind: "article" as const, eventKind: 30023, bech32: naddr, uri: `nostr:${naddr}` };

describe("OpenElsewhere", () => {
  it("an article on a desktop offers Ditto and Primal, each opening the article itself in a new tab", () => {
    render(<OpenElsewhere entity={article} ua={MAC} />);
    const ditto = screen.getByTestId("open-elsewhere-ditto");
    expect(ditto).toHaveAttribute("href", `https://ditto.pub/${naddr}`);
    const primal = screen.getByTestId("open-elsewhere-primal");
    expect(primal).toHaveAttribute("href", `https://primal.net/a/${naddr}`);
    expect(primal).toHaveAttribute("target", "_blank");
    expect(primal).toHaveAttribute("rel", "noopener");
    expect(screen.getByTestId("open-elsewhere")).toHaveTextContent(/another client/i);
    expect(screen.queryByTestId("open-elsewhere-amethyst")).toBeNull();
    expect(screen.queryByTestId("open-elsewhere-default")).toBeNull();
  });

  it("a wiki page offers Ditto alone — Primal answers 404 for kind 30818", () => {
    const wiki = nip19.naddrEncode({ kind: 30818, pubkey: "a".repeat(64), identifier: "hello" });
    render(<OpenElsewhere entity={{ kind: "article", eventKind: 30818, bech32: wiki, uri: `nostr:${wiki}` }} ua={MAC} />);
    expect(screen.getByTestId("open-elsewhere-ditto")).toHaveAttribute("href", `https://ditto.pub/${wiki}`);
    expect(screen.queryByTestId("open-elsewhere-primal")).toBeNull();
  });

  it("on Android the web clients are joined by Amethyst and the default app, in the same tab", () => {
    render(<OpenElsewhere entity={article} ua={PIXEL} />);
    expect(screen.getByTestId("open-elsewhere-amethyst").getAttribute("href")).toMatch(/^intent:\/\/naddr1.*com\.vitorpamplona\.amethyst/);
    const app = screen.getByTestId("open-elsewhere-default");
    expect(app).toHaveAttribute("href", `nostr:${naddr}`);
    expect(app).not.toHaveAttribute("target");
  });

  it("renders nothing when no client renders the kind — no heading over nothing", () => {
    const nevent = nip19.neventEncode({ id: "e".repeat(64) });
    const { container } = render(<OpenElsewhere entity={{ kind: "event", eventKind: 30000, bech32: nevent, uri: `nostr:${nevent}` }} ua={MAC} />);
    expect(container).toBeEmptyDOMElement();
  });
});
