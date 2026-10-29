// @vitest-environment jsdom
/**
 * While a page's code downloads, the screen keeps its frame: the header the
 * pages share stays up, with a spinner under it, rather than the whole screen
 * blanking to a spinner and the header popping back in.
 */
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => null }));
// The header's search box runs the whole typeahead; its own tests cover it.
vi.mock("@/components/HeaderSearchBox", () => ({ HeaderSearchBox: () => <div data-testid="header-search" /> }));

import { RouteFallback } from "./RouteFallback";

describe("RouteFallback", () => {
  it("keeps the header up, with the spinner beneath it", () => {
    renderWithProviders(<RouteFallback />);
    const header = screen.getByTestId("public-header");
    const loading = screen.getByTestId("route-loading");
    expect(header.compareDocumentPosition(loading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
