// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://brainstorm.world/"}
/**
 * A link to someone's router or home server names the READER's network. Its
 * favicon would be requested from there, raising Chrome's "access other apps
 * and services on this device" prompt on brainstorm.world — so it gets the
 * globe without a request.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { __resetFavicons, Favicon } from "./LinkPreview";

describe("Favicon on a public page", () => {
  beforeEach(() => __resetFavicons());

  it.each(["192.168.1.1", "192.168.1.1:8080", "umbrel.local", "[::1]:4869", "localhost:3000"])(
    "requests nothing from %s",
    (host) => {
      render(<Favicon host={host} className="h-3 w-3" />);
      expect(document.querySelector("img")).toBeNull();
      expect(screen.getByTestId("favicon-globe")).toBeInTheDocument();
    },
  );

  it("still loads a public site's", () => {
    render(<Favicon host="example.org" className="h-3 w-3" />);
    expect(document.querySelector("img")?.getAttribute("src")).toBe("https://example.org/favicon.ico");
  });
});
