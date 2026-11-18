// @vitest-environment jsdom
/**
 * The way into the first run for an account new to Brainstorm, wherever it
 * signed in: sent once to /start, keeping where it was going. Anyone already
 * using Brainstorm — an account made here before the first run existed
 * included — is left where they are.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const ME = "a".repeat(64);
const h = vi.hoisted(() => ({
  location: "/",
  search: "",
  navigate: vi.fn(),
  history: { isSuccess: true, data: { data: {} as Record<string, unknown> } } as Record<string, unknown>,
  createdInApp: false,
}));

vi.mock("wouter", () => ({ useLocation: () => [h.location, h.navigate], useSearch: () => h.search }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ pubkey: ME }) }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/hooks/useSelf", () => ({ useSelfHistory: () => h.history }));
vi.mock("@/accounts/display", () => ({ identityHas: () => h.createdInApp }));

import { FirstRunGate } from "./FirstRunGate";
import { markFirstRunDone } from "@/lib/firstRun";

const neverScored = { isSuccess: true, data: { data: { last_time_calculated_graperank: null } } };
const scored = { isSuccess: true, data: { data: { last_time_calculated_graperank: "2026-10-01T00:00:00Z" } } };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  h.location = "/";
  h.search = "";
  h.history = neverScored;
  h.createdInApp = false;
});

describe("FirstRunGate", () => {
  it("sends an account new to Brainstorm to the first run, keeping where it was going", () => {
    h.location = "/p/npub1x";
    h.search = "tab=notes";
    render(<FirstRunGate />);
    expect(h.navigate).toHaveBeenCalledWith(`/start?next=${encodeURIComponent("/p/npub1x?tab=notes")}`, {
      replace: true,
    });
  });

  it("leaves an account already using Brainstorm alone — one made here before the first run included", () => {
    h.history = scored;
    h.createdInApp = true;
    render(<FirstRunGate />);
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it("decides nothing before the server answers", () => {
    h.history = { isSuccess: false };
    render(<FirstRunGate />);
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it("doesn't send them again once they finished or skipped it", () => {
    markFirstRunDone(ME);
    render(<FirstRunGate />);
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it("stays out of the way on the first run itself and on sign-in", () => {
    for (const where of ["/start", "/login"]) {
      h.location = where;
      render(<FirstRunGate />);
    }
    expect(h.navigate).not.toHaveBeenCalled();
  });
});
