// @vitest-environment jsdom
/**
 * /welcome for an account that already follows people — reached from /setup's
 * "Find people" or Settings — only adds. It says so ("nobody is removed"),
 * ticks nobody in advance (NosFabrica included), counts what it will add, and
 * publishes just those people through the merge that never shrinks a list.
 * A brand-new account keeps "Follow a few accounts to begin" (WelcomePage.test).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { SUGGESTED_ACCOUNTS } from "@/lib/suggestedAccounts";

const ME = "a".repeat(64);
const JACK = SUGGESTED_ACCOUNTS.find((a) => a.name === "jack")!.pubkey;

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  followPubkeys: vi.fn(),
  /** What the relays say about their follow list; "checking" until they answer. */
  verdict: "has-follows" as "checking" | "none" | "has-follows",
  /** This browser's own count — 0 on a device that hasn't seen their list yet. */
  known: 416,
  followDone: true,
}));
vi.mock("wouter", () => ({ useLocation: () => ["/welcome", h.navigate] }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => ({ pubkey: ME, displayName: "Ana" }),
}));
vi.mock("@/hooks/useVerifiedNoFollows", () => ({ useVerifiedNoFollows: () => h.verdict }));
vi.mock("@/hooks/useFinishSetup", () => ({ useFinishSetup: () => ({ followDone: h.followDone }) }));
vi.mock("@/lib/followStore", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  knownFollowCount: () => h.known,
}));
// One map for every render, as the real hook keeps: a fresh one each time loops the picker.
const stable = vi.hoisted(() => ({ profiles: new Map() }));
vi.mock("@/hooks/useLiveProfile", () => ({ useLiveProfiles: () => stable.profiles }));
vi.mock("@/services/search", () => ({ HOUSE_POV: "nosfabrica", suggestProfiles: vi.fn(async () => []) }));
vi.mock("@/services/trustAnchor", () => ({ triggerScoringAndAnchor: vi.fn(async () => {}) }));
vi.mock("@/services/socialActions", () => ({
  followPubkeys: (...a: unknown[]) => h.followPubkeys(...a),
  recoverFollowListFromRelay: vi.fn(),
}));

import WelcomePage from "./WelcomePage";

beforeEach(() => {
  vi.clearAllMocks();
  h.followPubkeys.mockResolvedValue({ success: true });
  h.verdict = "has-follows";
  h.known = 416;
  h.followDone = true;
});

describe("/welcome for an account that already follows people", () => {
  it("says it only adds, and ticks nobody in advance", () => {
    renderWithProviders(<WelcomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Find more people to follow");
    expect(screen.getByTestId("welcome-add-only")).toHaveTextContent(
      "You follow 416 people. Anyone you pick is added — nobody is removed.",
    );
    for (const toggle of screen.getAllByTestId(/^person-toggle-/)) {
      expect(toggle).toHaveAttribute("aria-pressed", "false");
    }
    expect(screen.getByTestId("welcome-finish")).toBeDisabled();
    expect(screen.getByTestId("welcome-skip")).toHaveTextContent("Done");
  });

  it("adds only the people they pick", async () => {
    renderWithProviders(<WelcomePage />);
    fireEvent.click(screen.getByTestId(`person-toggle-${JACK.slice(0, 8)}`));
    expect(screen.getByTestId("welcome-selected")).toHaveTextContent("Adding 1");
    const finish = screen.getByTestId("welcome-finish");
    expect(finish).toHaveTextContent("Add 1 to your follows");
    fireEvent.click(finish);
    await waitFor(() => expect(h.followPubkeys).toHaveBeenCalled());
    expect(h.followPubkeys.mock.calls[0][0]).toEqual([JACK]);
  });

  /**
   * A new device: this browser hasn't seen their list, so its own count is 0
   * until the relays answer. The picker waits for that answer — it never
   * shows the new-user version with NosFabrica ticked to someone who follows
   * people.
   */
  describe("on a device that hasn't seen their list yet", () => {
    beforeEach(() => {
      h.known = 0;
      h.followDone = false;
    });

    it("waits for the relays before showing anyone to pick", () => {
      h.verdict = "checking";
      renderWithProviders(<WelcomePage />);
      expect(screen.getByTestId("welcome-checking")).toHaveTextContent("Checking your network");
      expect(screen.queryByTestId("welcome-finish")).toBeNull();
    });

    it("once the relays find their list, it only adds — nobody ticked in advance", () => {
      h.verdict = "checking";
      const view = renderWithProviders(<WelcomePage />);
      h.verdict = "has-follows";
      view.rerender(<WelcomePage />);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Find more people to follow");
      for (const toggle of screen.getAllByTestId(/^person-toggle-/)) {
        expect(toggle).toHaveAttribute("aria-pressed", "false");
      }
      expect(screen.getByTestId("welcome-finish")).toBeDisabled();
    });
  });
});
