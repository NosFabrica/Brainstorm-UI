import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/utils";
import { AutoScoreReturning } from "./AutoScoreReturning";

const PUBKEY = "a".repeat(64);
const TA_PUBKEY = "b".repeat(64);

const triggerScoringAndAnchor = vi.fn(async () => {});
const historyData = vi.fn<() => Record<string, unknown>>(() => ({ ta_pubkey: TA_PUBKEY }));
const followCount = vi.fn(() => 60);
const createdInApp = vi.fn(() => false);

vi.mock("@/services/trustAnchor", () => ({
  triggerScoringAndAnchor: (...args: unknown[]) => triggerScoringAndAnchor(...(args as [])),
}));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => ({ pubkey: PUBKEY, npub: "npub1lira" }),
}));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/hooks/useSelf", () => ({
  useSelfHistory: () => ({ isSuccess: true, data: { data: historyData() } }),
}));
vi.mock("@/lib/followStore", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  knownFollowCount: () => followCount(),
}));
vi.mock("@/accounts/display", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  identityHas: () => createdInApp(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  historyData.mockReturnValue({ ta_pubkey: TA_PUBKEY });
  followCount.mockReturnValue(60);
  createdInApp.mockReturnValue(false);
});

describe("the returning-user auto-kick", () => {
  // ta_pubkey is minted during login itself (authChallenge verify), so every
  // session-holder has one before any calculation ran. Its presence must not
  // read as "already scored" — that was exactly the bug that left returning
  // signer users unscored forever.
  it("fires for a returning key whose assistant exists but was never scored", () => {
    renderWithProviders(<AutoScoreReturning />);

    expect(triggerScoringAndAnchor).toHaveBeenCalledWith(PUBKEY);
  });

  it("stays quiet once a calculation was already triggered for the account", () => {
    historyData.mockReturnValue({
      ta_pubkey: TA_PUBKEY,
      last_time_triggered_graperank: "2026-08-20T10:00:00Z",
    });

    renderWithProviders(<AutoScoreReturning />);

    expect(triggerScoringAndAnchor).not.toHaveBeenCalled();
  });

  it("stays quiet once a calculation has completed", () => {
    historyData.mockReturnValue({
      ta_pubkey: TA_PUBKEY,
      last_time_calculated_graperank: "2026-08-20T10:05:00Z",
    });

    renderWithProviders(<AutoScoreReturning />);

    expect(triggerScoringAndAnchor).not.toHaveBeenCalled();
  });

  it("kicks at most once per account, ever", () => {
    localStorage.setItem(`brainstorm_auto_score_kicked:${PUBKEY}`, "true");

    renderWithProviders(<AutoScoreReturning />);

    expect(triggerScoringAndAnchor).not.toHaveBeenCalled();
  });

  it("leaves no-follow users to the home-page nudge", () => {
    followCount.mockReturnValue(0);

    renderWithProviders(<AutoScoreReturning />);

    expect(triggerScoringAndAnchor).not.toHaveBeenCalled();
  });

  it("leaves in-app first-timers to the onboarding flow", () => {
    createdInApp.mockReturnValue(true);

    renderWithProviders(<AutoScoreReturning />);

    expect(triggerScoringAndAnchor).not.toHaveBeenCalled();
  });
});
