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
});
