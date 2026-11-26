// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
const triggerUserGraperank = vi.fn();
vi.mock("@/services/api", () => ({
  apiClient: { triggerUserGraperank: (...a: unknown[]) => triggerUserGraperank(...a) },
}));

import { FailureBreakdownCard } from "./FailureBreakdownCard";
import { TriggerInFlightError } from "../useTriggers";
import type { BrainstormRequestInstance } from "../types";

const pk = (c: string) => c.repeat(64);
const failed = (pubkey: string, i: number): BrainstormRequestInstance =>
  ({
    created_at: `2026-11-0${i}T00:00:00Z`,
    updated_at: `2026-11-0${i}T00:00:00Z`,
    private_id: i,
    status: "failure",
    ta_status: null,
    internal_publication_status: null,
    error: { message: "neo4j timeout" },
    pubkey,
  }) as BrainstormRequestInstance;

function wrap(children: ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  toast.mockReset();
  triggerUserGraperank.mockReset();
});

describe("FailureBreakdownCard's group retry", () => {
  it("sends each run through the console's in-flight claim, skipping anyone already in flight", async () => {
    const retriggerOne = vi.fn(async (p: string) => {
      if (p === pk("c")) throw new TriggerInFlightError();
    });
    const onTriggered = vi.fn();
    const { getByTestId } = render(
      wrap(
        <FailureBreakdownCard
          items={[failed(pk("a"), 1), failed(pk("b"), 2), failed(pk("c"), 3)]}
          isLoading={false}
          isError={false}
          onViewUser={() => {}}
          triggering={new Set([pk("a")])}
          retriggerOne={retriggerOne}
          onTriggered={onTriggered}
        />,
      ),
    );
    fireEvent.click(getByTestId("failure-breakdown-retry-all"));
    await waitFor(() => expect(toast).toHaveBeenCalled());

    // Nothing goes around the claim, and a's run already out isn't sent again.
    expect(triggerUserGraperank).not.toHaveBeenCalled();
    expect(retriggerOne).not.toHaveBeenCalledWith(pk("a"));
    expect(retriggerOne).toHaveBeenCalledWith(pk("b"));
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Re-triggered 1 user", description: "2 skipped (already in flight)." }),
    );
    expect(onTriggered).toHaveBeenCalledTimes(1);
  });

  it("counts a refused request as failed", async () => {
    const retriggerOne = vi.fn(async () => {
      throw new Error("500");
    });
    const { getByTestId } = render(
      wrap(
        <FailureBreakdownCard
          items={[failed(pk("a"), 1)]}
          isLoading={false}
          isError={false}
          onViewUser={() => {}}
          triggering={new Set()}
          retriggerOne={retriggerOne}
          onTriggered={() => {}}
        />,
      ),
    );
    fireEvent.click(getByTestId("failure-breakdown-retry-all"));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Re-triggered 0 users · 1 failed", variant: "destructive" }),
      ),
    );
  });
});
