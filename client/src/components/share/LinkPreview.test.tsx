// @vitest-environment jsdom
/**
 * Favicons without a third-party service: a site's own /favicon.ico first,
 * then the places sites actually keep them, then the apex domain when the
 * link said www — and only after all of that, the globe.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Favicon } from "./LinkPreview";

function img() {
  return document.querySelector("img[data-testid='favicon']") as HTMLImageElement | null;
}

describe("Favicon", () => {
  it("walks the candidates before settling on the globe", () => {
    render(<Favicon host="www.relayop.xyz" className="h-3 w-3" />);
    expect(img()?.getAttribute("src")).toBe("https://www.relayop.xyz/favicon.ico");
    fireEvent.error(img()!);
    expect(img()?.getAttribute("src")).toBe("https://www.relayop.xyz/favicon.png");
    fireEvent.error(img()!);
    expect(img()?.getAttribute("src")).toBe("https://relayop.xyz/favicon.ico");
    fireEvent.error(img()!);
    expect(img()?.getAttribute("src")).toBe("https://relayop.xyz/favicon.png");
    fireEvent.error(img()!);
    expect(img()).toBeNull();
    expect(screen.getByTestId("favicon-globe")).toBeInTheDocument();
  });

  it("does not repeat the apex when the host already is one", () => {
    render(<Favicon host="example.org" className="h-3 w-3" />);
    fireEvent.error(img()!);
    expect(img()?.getAttribute("src")).toBe("https://example.org/favicon.png");
    fireEvent.error(img()!);
    expect(img()).toBeNull();
  });
});
