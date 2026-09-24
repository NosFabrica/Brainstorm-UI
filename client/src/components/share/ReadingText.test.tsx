import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReadingText, readingLinkLabel } from "@/components/share/ReadingText";

describe("ReadingText (descriptions)", () => {
  it("links bare domains and keeps the sentence's full stop", () => {
    const { container } = render(<ReadingText text="Sign up at www.relayop.xyz. Ask @alice." />);
    const link = screen.getByTestId("reading-link");
    expect(link.getAttribute("href")).toBe("https://www.relayop.xyz");
    expect(container).toHaveTextContent("Sign up at www.relayop.xyz. Ask @alice.");
  });

  it("an email address is not a handle", () => {
    const { container } = render(<ReadingText text="Tips: nodesignal@getalby.com" />);
    expect(container.querySelector("span.font-medium")).toBeNull();
    expect(container).toHaveTextContent("Tips: nodesignal@getalby.com");
  });

  it("labels GitHub PRs and opaque blob URLs briefly", () => {
    expect(readingLinkLabel("https://github.com/nostr-protocol/nips/pull/1234")).toBe("nostr-protocol/nips#1234");
    expect(readingLinkLabel("https://cdn.satellite.earth/97c5e2e2fda64e7f21cd39aa01.mp4")).toBe("cdn.satellite.earth");
  });

  it("renders an HTML description as text, never as markup", () => {
    const { container } = render(<ReadingText text={'<p>One</p><p>Two <img src=x onerror="alert(1)"><b>bold</b></p><p>Three</p>'} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("strong")).toHaveTextContent("bold");
    expect(container).toHaveTextContent("One");
  });
});
