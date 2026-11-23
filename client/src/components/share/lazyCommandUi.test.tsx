// @vitest-environment jsdom
/**
 * The tag pickers' command menu loads on first opening: a cold one shows its
 * fallback until the primitives arrive, and one warmed beforehand draws them
 * on its first render, so Radix can focus the search box as it opens.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { preloadCommandUi, WithCommandUi } from "./lazyCommandUi";

const menu = (
  <WithCommandUi fallback={<p data-testid="fallback" />}>
    {({ Command, CommandInput }) => (
      <Command>
        <CommandInput data-testid="search" />
      </Command>
    )}
  </WithCommandUi>
);

describe("WithCommandUi", () => {
  it("draws the fallback until the primitives arrive, then the menu", async () => {
    render(menu);
    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(await screen.findByTestId("search")).toBeInTheDocument();
    expect(screen.queryByTestId("fallback")).toBeNull();
  });

  it("draws the menu at once when it was warmed", async () => {
    await preloadCommandUi();
    render(menu);
    expect(screen.getByTestId("search")).toBeInTheDocument();
  });
});
