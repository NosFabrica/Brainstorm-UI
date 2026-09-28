/**
 * The chips on a person's row in search: what they publish, one tap to it.
 * Rendered without a router — wouter's Link works on the browser location.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { nip19 } from "nostr-tools";
import { scopedSearchHref } from "@/lib/searchSyntax";
import type { PersonContent, PersonContentChip } from "@/lib/personContent";
import { PersonContentChips } from "./PersonContentChips";

const STACI = "5".repeat(64);
const STACI_NPUB = nip19.npubEncode(STACI);
const chip = (key: PersonContentChip["key"], label: string, tab = key, liveNow = false): PersonContentChip => ({ key, label, tab, liveNow });
const shop = chip("shop", "Shop");
const recipes = chip("recipes", "Recipes");

describe("PersonContentChips", () => {
  it("one link per chip, in order, to the person's scoped search", () => {
    const content: PersonContent = { chips: [shop, recipes] };
    render(<PersonContentChips pubkey={STACI} name="Zap Cooking" content={content} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    const shopLink = screen.getByTestId("person-content-chip-shop");
    expect(shopLink.getAttribute("href")).toBe(scopedSearchHref(STACI, "shop"));
    expect(shopLink.getAttribute("href")).toMatch(/^\/\?q=from%3Anpub1.*&t=shop$/);
    expect(shopLink).toHaveAttribute("aria-label", "Zap Cooking's shop");
    expect(screen.getByTestId("person-content-chip-recipes")).toHaveAttribute("aria-label", "Zap Cooking's recipes");
    expect(shopLink).toHaveTextContent("Shop");
    expect(screen.getByTestId("person-content-chips")).toHaveAttribute("data-state", "ready");
  });

  it("reserves its slot while the lookup is out, and when there is nothing to say", () => {
    const { rerender } = render(<PersonContentChips pubkey={STACI} name="Staci" content={undefined} />);
    expect(screen.getByTestId("person-content-chips")).toHaveAttribute("data-state", "pending");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    rerender(<PersonContentChips pubkey={STACI} name="Staci" content={{ chips: [] }} />);
    expect(screen.getByTestId("person-content-chips")).toHaveAttribute("data-state", "ready");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("a click opens the scoped search and never reaches the row", () => {
    const rowClick = vi.fn();
    const onNavigate = vi.fn();
    render(
      <div onClick={rowClick}>
        <PersonContentChips pubkey={STACI} name="Staci" content={{ chips: [shop] }} onNavigate={onNavigate} />
      </div>,
    );
    const link = screen.getByTestId("person-content-chip-shop");
    // Mousedown is swallowed so the search box keeps its focus.
    expect(fireEvent.mouseDown(link)).toBe(false);
    fireEvent.click(link);
    expect(rowClick).not.toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe(`?q=from%3A${STACI_NPUB}&t=shop`);
  });

  it("a stream on air shows the red dot", () => {
    const { rerender } = render(<PersonContentChips pubkey={STACI} name="Staci" content={{ chips: [chip("live", "Live", "live", true)] }} />);
    expect(screen.getByTestId("person-content-live-dot")).toBeInTheDocument();
    rerender(<PersonContentChips pubkey={STACI} name="Staci" content={{ chips: [chip("live", "Live", "live", false)] }} />);
    expect(screen.queryByTestId("person-content-live-dot")).toBeNull();
  });

  it("links can be taken out of the tab order for listbox rows", () => {
    render(<PersonContentChips pubkey={STACI} name="Staci" content={{ chips: [shop, recipes] }} linkTabIndex={-1} />);
    for (const link of screen.getAllByRole("link")) expect(link).toHaveAttribute("tabindex", "-1");
  });
});
