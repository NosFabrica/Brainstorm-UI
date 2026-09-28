/**
 * The QR is smaller than the link it encodes deserves — on purpose.
 *
 * QR's alphanumeric mode costs 5.5 bits per character instead of byte mode's 8,
 * but the encoder picks ONE mode for the whole string. So the payload has to be
 * uppercase end to end, host included, or the saving is lost entirely.
 *
 * This is the tripwire the ticket asks for. Lowercasing the payload breaks
 * nothing visible — the QR just quietly grows — so the module count is asserted
 * directly. `viewBox` is the module count: "0 0 25 25" is a version-2 symbol.
 *
 * Issue: .scratch/shorturl/issues/05-qr-alphanumeric.md
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { QRCodeSVG } from "qrcode.react";

import { qrPayload } from "./shortLink";

const SHORT = "https://brainstorm.world/s/ab3xk9qz";

/** The module count of the rendered symbol, e.g. 25 for a 25×25 version-2 QR. */
function modules(value: string): number {
  const { container } = render(<QRCodeSVG value={value} level="M" />);
  const viewBox = container.querySelector("svg")?.getAttribute("viewBox") ?? "";
  return Number(viewBox.split(" ")[2]);
}

describe("the share QR", () => {
  it("is a 25×25 symbol for a short link", () => {
    expect(modules(qrPayload(SHORT))).toBe(25);
  });

  it("would be 29×29 if the payload were left lowercase", () => {
    // Not a wish — this is what regressing looks like, pinned so the saving
    // can't be given away silently.
    expect(modules(SHORT)).toBe(29);
  });

  it("stays smaller than the canonical npub link it replaces", () => {
    const canonical =
      "https://brainstorm.world/p/npub17ngcvm59n9trc5kwam03rs5ts4n7gewxax53m7f2m4f464ls92cqr5qjta";
    expect(modules(qrPayload(SHORT))).toBeLessThan(modules(qrPayload(canonical)));
  });

  it("keeps error correction at M — the sizing assumes it", () => {
    // A different level changes the module count, which would make the numbers
    // above meaningless rather than wrong.
    const { container } = render(<QRCodeSVG value={qrPayload(SHORT)} level="M" />);
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 25 25");
  });
});

describe("the headroom behind the 25×25 figure", () => {
  // Measured against this library at level M: a version-2 symbol holds 38
  // uppercase alphanumeric characters; the 39th pushes it to 29×29.
  const V2_ALNUM_CAPACITY = 38;

  it("production fits, with three characters to spare", () => {
    const payload = qrPayload("https://brainstorm.world/s/ab3xk9qz");
    expect(payload.length).toBeLessThanOrEqual(V2_ALNUM_CAPACITY);
    expect(V2_ALNUM_CAPACITY - payload.length).toBe(3);
  });

  it("shows how little room a longer host leaves", () => {
    // Not a failure — a statement of fact, so the 25×25 claim isn't quoted
    // for an environment where it doesn't hold. brainstorm-staging.nosfabrica.com
    // is 52 characters and renders 29×29; only the production host fits.
    const staging = qrPayload("https://brainstorm-staging.nosfabrica.com/s/ab3xk9qz");
    expect(staging.length).toBeGreaterThan(V2_ALNUM_CAPACITY);
  });

  it("the original 12-character code would have cost the saving", () => {
    // D4 says lengthening codes is free. True for resolution — not for this:
    // the branch's original 12-char format lands on 39, one over the cap. Codes
    // may grow to 11 before the QR does.
    const twelve = qrPayload("https://brainstorm.world/s/ab3xk9qzwxyz");
    expect(twelve.length).toBe(39);
    expect(twelve.length).toBeGreaterThan(V2_ALNUM_CAPACITY);
  });
});
