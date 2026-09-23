/**
 * The profile's share sheet, pinned before it is rebuilt on the generic
 * ShareModal (2026-09-08): the invite framing, the OG card, the photo nudge
 * and "Open the page" must survive the refactor unchanged.
 *
 * The QR gets an uppercased URL so it reaches QR's alphanumeric mode — 25×25
 * modules instead of 29×29 — while everything a person reads or copies stays
 * lowercase. Nothing fails loudly if that split is undone: the QR just quietly
 * grows. So the QR assertions run against the real component, not a standalone
 * QR — dropping `qrPayload` from the sheet must turn this red.
 *
 * Issue: .scratch/shorturl/issues/05-qr-alphanumeric.md
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ShareProfileModal } from "./ShareProfileModal";

const copyMock = vi.fn(async (_text: string) => true);
vi.mock("@/lib/clipboard", () => ({ copyToClipboard: (text: string) => copyMock(text) }));
const navigate = vi.fn();
vi.mock("wouter", () => ({ useLocation: () => ["/", navigate] }));
vi.mock("@/components/ShareOgCard", () => ({ ShareOgCard: ({ displayName }: { displayName: string }) => <div data-testid="og-card">{displayName}</div> }));

const URL = "https://brainstorm.world/p/npub1joe";
const base = { open: true, onOpenChange: vi.fn(), npub: "npub1joe", displayName: "Joe Martin", shareUrl: URL };

beforeEach(() => {
  copyMock.mockClear();
  navigate.mockClear();
});

describe("ShareProfileModal", () => {
  it("shares a profile: the OG card, the link, and a way to open the page", () => {
    render(<ShareProfileModal {...base} picture="https://img/joe.jpg" />);
    const modal = screen.getByTestId("modal-share-profile");
    expect(modal).toHaveTextContent("Verification Score");
    expect(modal).toHaveTextContent("Share this profile");
    expect(screen.getByTestId("share-open-page-card")).toHaveAttribute("href", URL);
    expect(screen.getByTestId("og-card")).toHaveTextContent("Joe Martin");
    expect(screen.getByTestId("share-link-input")).toHaveValue(URL);
    expect(screen.getByTestId("share-open-page-link")).toHaveAttribute("href", URL);
    expect(screen.getByTestId("share-qr")).toBeInTheDocument();
  });

  it("opened from the page itself, it does not offer to open the page", () => {
    render(<ShareProfileModal {...base} onOwnPage />);
    expect(screen.queryByTestId("share-open-page-link")).toBeNull();
  });

  it("inviting without a photo nudges toward adding one, which closes the sheet and goes to settings", () => {
    const onOpenChange = vi.fn();
    render(<ShareProfileModal {...base} onOpenChange={onOpenChange} invite />);
    expect(screen.getByTestId("modal-share-profile")).toHaveTextContent("Invite to Brainstorm");
    fireEvent.click(screen.getByTestId("share-add-photo-nudge"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(navigate).toHaveBeenCalledWith("/settings?tab=profile");
  });

  it("inviting with a photo has no nudge", () => {
    render(<ShareProfileModal {...base} invite picture="https://img/joe.jpg" />);
    expect(screen.queryByTestId("share-add-photo-nudge")).toBeNull();
  });
});

// The server mints uppercase Crockford; the link people copy is lowercased.
const SHORT = "https://brainstorm.world/s/ab3xk9qz";
const NPUB = "npub17ngcvm59n9trc5kwam03rs5ts4n7gewxax53m7f2m4f464ls92cqr5qjta";

function openSheet(shareUrl: string) {
  render(<ShareProfileModal open onOpenChange={() => {}} npub={NPUB} displayName="Ada" shareUrl={shareUrl} />);
}

/**
 * The module count of the sheet's own QR, e.g. 25 for a 25×25 version-2 symbol.
 * Async because the QR component arrives in its own chunk.
 */
async function renderedModules(): Promise<number> {
  const svg = await waitFor(() => {
    const el = screen.getByTestId("share-qr").querySelector("svg");
    if (!el) throw new Error("QR not rendered yet");
    return el;
  });
  return Number(svg.getAttribute("viewBox")?.split(" ")[2]);
}

describe("the share sheet's QR", () => {
  it("is a 25×25 symbol for a short link", async () => {
    openSheet(SHORT);
    expect(await renderedModules()).toBe(25);
  });

  it("would be 29×29 if the sheet stopped uppercasing", async () => {
    // Not a wish — this is what the regression looks like. If the QR ever binds
    // the raw link again, the test above fails and this one explains why.
    openSheet(SHORT);
    expect(await renderedModules()).not.toBe(29);
  });

  it("leaves the canonical fallback link alone", async () => {
    // npub is bech32 and not ours to re-case, so no saving here — by design.
    openSheet(`https://brainstorm.world/p/${NPUB}`);
    expect(await renderedModules()).toBeGreaterThan(25);
  });
});

describe("what the sheet shows people", () => {
  it("keeps the link input on the lowercase form", () => {
    openSheet(SHORT);
    expect(screen.getByTestId("share-link-input")).toHaveValue(SHORT);
  });

  it("copies the lowercase form, not the QR payload", async () => {
    openSheet(SHORT);
    fireEvent.click(screen.getByTestId("share-copy-link"));
    await vi.waitFor(() => expect(copyMock).toHaveBeenCalledWith(SHORT));
  });

  it("opens the page on the lowercase form", () => {
    openSheet(SHORT);
    expect(screen.getByTestId("share-open-page-card")).toHaveAttribute("href", SHORT);
    expect(screen.getByTestId("share-open-page-link")).toHaveAttribute("href", SHORT);
  });
});
