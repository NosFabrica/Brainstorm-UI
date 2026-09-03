import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DegreeChip } from "./DegreeChip";

vi.mock("@/services/api", () => ({
  apiClient: { getShortestPath: vi.fn(async () => ({ reachable: true, hops: 3, path: [], pathCount: 1 })) },
}));

function renderChip(pov: "personalized" | "global") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <DegreeChip fromPubkey={"a".repeat(64)} toPubkey={"b".repeat(64)} rawId="npub1x" pov={pov} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("DegreeChip wears its origin's chrome", () => {
  it("global: neutral outline + the globe, so House distance never reads as yours", async () => {
    renderChip("global");
    const chip = await screen.findByTestId("stat-hops");
    expect(chip.getAttribute("data-pov")).toBe("global");
    expect(chip.className).toContain("border-slate-200");
    expect(chip.className).not.toContain("bg-brand-primary/10");
    expect(chip).toHaveTextContent("3rd");
  });

  it("personalized: the brand fill + person icon", async () => {
    renderChip("personalized");
    const chip = await screen.findByTestId("stat-hops");
    expect(chip.getAttribute("data-pov")).toBe("personalized");
    expect(chip.className).toContain("bg-brand-primary/10");
  });
});
