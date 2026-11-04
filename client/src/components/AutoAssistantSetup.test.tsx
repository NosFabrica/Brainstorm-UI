// @vitest-environment jsdom
/**
 * The background publish of the Assistant's two setup tasks, from any page:
 * once per task for what it should say now, again only when that changes,
 * never without a session, and never a loop on failure.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const s = vi.hoisted(() => ({
  session: true,
  menu: {} as Record<string, unknown>,
  map: {} as Record<string, unknown>,
  publish: vi.fn(),
  set: vi.fn(),
}));

vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ pubkey: "a".repeat(64) }) }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => s.session }));
vi.mock("@/hooks/useAssistantDutyMenu", () => ({
  useAssistantDutyMenu: (pk: string | undefined) => ({ ...s.menu, pk, publish: s.publish }),
}));
vi.mock("@/hooks/useAssistantTreasureMap", () => ({
  useAssistantTreasureMap: (pk: string | undefined) => ({ ...s.map, pk, set: s.set }),
}));

import { AutoAssistantSetup } from "./AutoAssistantSetup";

const OFFER = [{ key: "30382:rank", relay: "wss://scores.example/" }];
const SHOULD = [["30382:rank", "wss://scores.example/"]];

beforeEach(() => {
  vi.clearAllMocks();
  s.session = true;
  s.publish.mockResolvedValue({});
  s.set.mockResolvedValue({});
  s.menu = { supported: true, status: "current", settled: true, offer: OFFER };
  s.map = { supported: true, status: "current", settled: true, on: true, published: {}, shouldSay: SHOULD };
});

describe("AutoAssistantSetup", () => {
  it("does nothing when both are up to date", () => {
    render(<AutoAssistantSetup />);
    expect(s.publish).not.toHaveBeenCalled();
    expect(s.set).not.toHaveBeenCalled();
  });

  it("publishes a missing Duty Menu and turns on a never-published Treasure Map, for this account", () => {
    s.menu.status = "missing";
    s.map = { ...s.map, status: "missing", on: false, published: null };
    render(<AutoAssistantSetup />);
    expect(s.publish).toHaveBeenCalledTimes(1);
    expect(s.set).toHaveBeenCalledWith(true);
    expect(s.set).toHaveBeenCalledTimes(1);
  });

  it("asks once, however often the page renders", () => {
    s.menu.status = "out-of-date";
    const { rerender } = render(<AutoAssistantSetup />);
    rerender(<AutoAssistantSetup />);
    rerender(<AutoAssistantSetup />);
    expect(s.publish).toHaveBeenCalledTimes(1);
  });

  it("asks again when what it should say changes — and not after a failure for the same target", async () => {
    s.map.status = "out-of-date";
    s.set.mockRejectedValueOnce(new Error("relay down"));
    const { rerender } = render(<AutoAssistantSetup />);
    await Promise.resolve();
    rerender(<AutoAssistantSetup />);
    expect(s.set).toHaveBeenCalledTimes(1);

    s.map = { ...s.map, shouldSay: [...SHOULD, ["30382:followers", "wss://scores.example/"]] };
    rerender(<AutoAssistantSetup />);
    expect(s.set).toHaveBeenCalledTimes(2);
  });

  it("leaves a Treasure Map its owner turned off", () => {
    s.map = { ...s.map, status: "missing", on: false, published: {} };
    render(<AutoAssistantSetup />);
    expect(s.set).not.toHaveBeenCalled();
  });

  it("does nothing without a Brainstorm session: the routes need one", () => {
    s.session = false;
    s.menu.status = "missing";
    s.map.status = "out-of-date";
    render(<AutoAssistantSetup />);
    expect(s.publish).not.toHaveBeenCalled();
    expect(s.set).not.toHaveBeenCalled();
  });
});
