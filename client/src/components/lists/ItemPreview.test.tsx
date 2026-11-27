/**
 * The preview draws the item on the design system's Card (docs/design-system.md),
 * not a hand-rolled `bg-white dark:bg-slate-900` box.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import type { ResolvedConcept } from "@/lib/conceptResolution";

vi.mock("@/components/share/DListItemHero", () => ({
  DListItemHeroPreview: () => <div data-testid="hero-stub" />,
}));
vi.mock("@/components/dictionary/DListItemCard", () => ({ DListItemCardPreview: () => null }));
vi.mock("@/components/dictionary/DListItemRow", () => ({ DListItemRow: () => null }));
vi.mock("@/hooks/useLinkTemplates", () => ({ useLinkTemplates: () => ({ data: new Map() }) }));
vi.mock("@/lib/listDraft", () => ({ linkReadouts: () => [] }));

import { ItemPreview } from "./ItemPreview";

describe("ItemPreview", () => {
  it("shows the item on a Card", () => {
    const resolved = { governing: { links: [] } } as unknown as ResolvedConcept;
    render(<ItemPreview resolved={resolved} item={{} as NostrEvent} />);
    const surface = screen.getByTestId("hero-stub").parentElement!;
    expect(surface).toHaveClass("rounded-2xl", "border-border", "bg-card", "p-4", "sm:p-5");
    expect(surface).not.toHaveClass("bg-white");
  });
});
