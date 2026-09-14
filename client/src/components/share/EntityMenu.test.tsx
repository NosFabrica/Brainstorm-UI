/**
 * The ⋯ menu on a public page holds the power-user things — copy the keys,
 * open in another Nostr client — so the page itself stays clean (team,
 * 2026-09-08: "normies can safely ignore them"). The first Radix DropdownMenu
 * opened in this suite: pointerDown on the trigger, content in a portal.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { nip19 } from "nostr-tools";
import { EntityMenu } from "./EntityMenu";

const copyMock = vi.fn(async (_text: string) => true);
vi.mock("@/lib/clipboard", () => ({ copyToClipboard: (text: string) => copyMock(text) }));

const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124.0 Safari/537.36";
const PIXEL = "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/124.0 Mobile Safari/537.36";
const npub = nip19.npubEncode("a".repeat(64));
const entity = { kind: "profile" as const, bech32: npub, uri: `nostr:${npub}` };
const copies = [
  { id: "npub", label: "Copy npub", value: npub },
  { id: "hex", label: "Copy public key (hex)", value: "a".repeat(64) },
];

const open = async () => {
  fireEvent.pointerDown(screen.getByTestId("entity-menu"), { button: 0, ctrlKey: false });
  return screen.findByRole("menu");
};

beforeEach(() => copyMock.mockClear());

describe("EntityMenu", () => {
  it("the ⋯ opens a menu: the copies first, then the apps under Open in", async () => {
    render(<EntityMenu entity={entity} copies={copies} ua={MAC} />);
    const menu = await open();
    expect(within(menu).getByTestId("menu-copy-npub")).toHaveTextContent("Copy npub");
    expect(within(menu).getByTestId("menu-copy-hex")).toHaveTextContent("Copy public key (hex)");
    expect(menu).toHaveTextContent(/Open in/);
    const primal = within(menu).getByTestId("open-primal");
    expect(primal).toHaveAttribute("href", `https://primal.net/p/${npub}`);
    expect(primal).toHaveAttribute("target", "_blank");
    expect(primal).toHaveAttribute("rel", "noopener");
    expect(within(menu).queryByTestId("open-amethyst")).toBeNull();
    expect(within(menu).queryByTestId("open-default")).toBeNull();
    // Copies come before the apps.
    expect(within(menu).getByTestId("menu-copy-npub").compareDocumentPosition(primal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("copying keeps the menu open and says Copied for a moment", async () => {
    render(<EntityMenu entity={entity} copies={copies} ua={MAC} />);
    const menu = await open();
    fireEvent.click(within(menu).getByTestId("menu-copy-hex"));
    expect(copyMock).toHaveBeenCalledWith("a".repeat(64));
    await waitFor(() => expect(within(menu).getByTestId("menu-copy-hex")).toHaveTextContent("Copied"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("leading items sit before the copies and trailing ones after the apps", async () => {
    render(
      <EntityMenu entity={entity} copies={copies} ua={MAC} leading={<div role="menuitem" data-testid="lead">Mute</div>} trailing={<div role="menuitem" data-testid="trail">Advanced view</div>} />,
    );
    const menu = await open();
    const lead = within(menu).getByTestId("lead");
    const trail = within(menu).getByTestId("trail");
    const firstCopy = within(menu).getByTestId("menu-copy-npub");
    const primal = within(menu).getByTestId("open-primal");
    expect(lead.compareDocumentPosition(firstCopy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(primal.compareDocumentPosition(trail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("on Android the menu offers Amethyst and the default app; on a Mac neither", async () => {
    render(<EntityMenu entity={entity} copies={copies} ua={PIXEL} />);
    const menu = await open();
    expect(within(menu).getByTestId("open-amethyst").getAttribute("href")).toMatch(/^intent:\/\/.*package=com\.vitorpamplona\.amethyst/);
    expect(within(menu).getByTestId("open-amethyst")).not.toHaveAttribute("target");
    expect(within(menu).getByTestId("open-default")).toHaveAttribute("href", `nostr:${npub}`);
  });

  // "Why would they want this?" (Benjamin, over Copy nprofile, 2026-09-08):
  // a row can say what its key is for, in a muted line under the label.
  it("a copy row carries its hint under the label, and keeps it while saying Copied", async () => {
    render(
      <EntityMenu
        entity={entity}
        copies={[{ id: "nprofile", label: "Copy nprofile", value: npub, hint: "Their key plus the relays their posts live on" }, ...copies]}
        ua={MAC}
      />,
    );
    const menu = await open();
    const row = within(menu).getByTestId("menu-copy-nprofile");
    expect(within(row).getByTestId("menu-copy-nprofile-hint")).toHaveTextContent("Their key plus the relays their posts live on");
    expect(within(menu).queryByTestId("menu-copy-npub-hint")).toBeNull();
    fireEvent.click(row);
    await waitFor(() => expect(row).toHaveTextContent("Copied"));
    expect(row).toHaveTextContent("Their key plus the relays their posts live on");
  });

  // The hashtag page's "Open in" footer moves into a ⋯ beside its title.
  it("a hashtag menu offers Copy link and the two web searches — nothing native, no Ditto", async () => {
    render(
      <EntityMenu
        entity={{ kind: "hashtag", bech32: "bitcoin", uri: "" }}
        copies={[{ id: "link", label: "Copy link", value: "https://brainstorm.world/t/bitcoin", hint: "This page's address" }]}
        ua={PIXEL}
      />,
    );
    const menu = await open();
    expect(within(menu).getByTestId("menu-copy-link-hint")).toHaveTextContent("This page's address");
    const primal = within(menu).getByTestId("open-primal");
    expect(primal).toHaveAttribute("href", "https://primal.net/search/%23bitcoin");
    expect(primal).toHaveAttribute("target", "_blank");
    const band = within(menu).getByTestId("open-nostrband");
    expect(band).toHaveAttribute("href", "https://nostr.band/?q=%23bitcoin");
    expect(band.querySelector("img")).toBeNull();
    expect(within(menu).queryByTestId("open-ditto")).toBeNull();
    expect(within(menu).queryByTestId("open-amethyst")).toBeNull();
    expect(within(menu).queryByTestId("open-default")).toBeNull();
  });

  // Benjamin, 2026-09-09: Ditto and Primal 404 on lists, shop listings and
  // more. When no client renders the kind, the menu keeps the copies and
  // drops the "Open in" section altogether — no heading over nothing.
  it("with no client to offer, the menu has the copies and no Open in section", async () => {
    const nevent = nip19.neventEncode({ id: "e".repeat(64) });
    render(
      <EntityMenu
        entity={{ kind: "event", eventKind: 30000, bech32: nevent, uri: `nostr:${nevent}` }}
        copies={[{ id: "nevent", label: "Copy nevent", value: nevent }]}
        ua={MAC}
      />,
    );
    const menu = await open();
    expect(within(menu).getByTestId("menu-copy-nevent")).toBeInTheDocument();
    expect(menu).not.toHaveTextContent(/Open in/);
    expect(within(menu).queryByTestId("open-ditto")).toBeNull();
    expect(within(menu).queryByTestId("open-primal")).toBeNull();
    expect(within(menu).queryAllByRole("separator")).toHaveLength(0);
  });
});
