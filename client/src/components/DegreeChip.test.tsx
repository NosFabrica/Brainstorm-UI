import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DegreeChip } from "./DegreeChip";

const api = vi.hoisted(() => ({
  getShortestHops: vi.fn(async (): Promise<{ reachable: boolean; hops: number | null }> => ({
    reachable: true,
    hops: 3,
  })),
  getShortestPath: vi.fn(),
}));
vi.mock("@/services/api", () => ({ apiClient: api }));

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

describe("DegreeChip asks for hops only", () => {
  it("never asks for the path network", async () => {
    renderChip("personalized");
    await screen.findByTestId("stat-hops");
    expect(api.getShortestHops).toHaveBeenCalledWith({ from: "a".repeat(64), to: "b".repeat(64) });
    expect(api.getShortestPath).not.toHaveBeenCalled();
  });
});

describe("DegreeChip reads the hop count", () => {
  it("1st degree when you follow them directly", async () => {
    api.getShortestHops.mockResolvedValueOnce({ reachable: true, hops: 1 });
    renderChip("personalized");
    expect(await screen.findByTestId("stat-hops")).toHaveTextContent("1st degree");
  });

  it("not connected when the server finds no path (hops: null)", async () => {
    api.getShortestHops.mockResolvedValueOnce({ reachable: false, hops: null });
    renderChip("personalized");
    expect(await screen.findByTestId("stat-hops")).toHaveTextContent("Not connected");
  });
});
