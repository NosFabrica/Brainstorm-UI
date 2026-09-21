// @vitest-environment jsdom
/**
 * The screen in issue #72: a new account picks who to follow and presses
 * "Follow & calculate my scores". It had no tests at all, which is why the
 * dead end behind that button went unnoticed — the equivalent branches were
 * only covered through the dashboard card.
 *
 * What matters here is what the person experiences: the list goes out and they
 * move on; they are asked only when the publish comes back unproven; and
 * cancelling leaves them where they were, with nothing published.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

const ME = "a".repeat(64);
const THEM = "b".repeat(64);

const navigate = vi.fn();
const toast = vi.fn();
const followPubkeys = vi.fn(async (_pks: string[], _opts?: Record<string, unknown>): Promise<Record<string, unknown>> => ({ success: true }));
const recoverFollowListFromRelay = vi.fn(async () => ({ found: false }));
const triggerScoringAndAnchor = vi.fn(async () => {});

vi.mock("wouter", () => ({ useLocation: () => ["/welcome", navigate] }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => ({ pubkey: ME, displayName: "Ana" }),
}));
vi.mock("@/hooks/useVerifiedNoFollows", () => ({ useVerifiedNoFollows: () => "none" }));
vi.mock("@/hooks/useFinishSetup", () => ({ useFinishSetup: () => ({ followDone: false }) }));
vi.mock("@/services/trustAnchor", () => ({
  triggerScoringAndAnchor: (...a: unknown[]) => triggerScoringAndAnchor(...(a as [])),
}));
vi.mock("@/services/socialActions", () => ({
  followPubkeys: (...a: unknown[]) => followPubkeys(...(a as [string[]])),
  recoverFollowListFromRelay: (...a: unknown[]) => recoverFollowListFromRelay(...(a as [])),
}));
/** The picker is its own screen; here it stands for "the person chose someone". */
vi.mock("@/components/FollowPicker", () => ({
  FollowPicker: ({ onContinue, continueLabel, busy }: { onContinue: (pks: string[]) => void; continueLabel: string; busy: boolean }) => (
    <button type="button" data-testid="welcome-finish" disabled={busy} onClick={() => onContinue([THEM])}>
      {continueLabel}
    </button>
  ),
}));

import WelcomePage from "./WelcomePage";

const pressFollow = async () => {
  renderWithProviders(<WelcomePage />);
  fireEvent.click(screen.getByTestId("welcome-finish"));
  await waitFor(() => expect(followPubkeys).toHaveBeenCalled());
};

const dialog = () => screen.queryByTestId("dialog-confirm-new-follow-list");

describe("finishing the welcome screen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    followPubkeys.mockResolvedValue({ success: true });
  });

  it("publishes and moves on, asking a new account nothing", async () => {
    await pressFollow();

    expect(followPubkeys).toHaveBeenCalledWith([THEM], undefined);
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(dialog()).toBeNull();
  });

  it("asks only when the publish came back unproven", async () => {
    followPubkeys.mockResolvedValue({ success: false, needsBaseConfirmation: true });

    await pressFollow();

    await waitFor(() => expect(dialog()).toBeInTheDocument());
    expect(navigate).not.toHaveBeenCalled();
  });

  it("cancelling publishes nothing and leaves them on the page", async () => {
    followPubkeys.mockResolvedValue({ success: false, needsBaseConfirmation: true });
    await pressFollow();
    await waitFor(() => expect(dialog()).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("button-new-follow-list-cancel"));

    await waitFor(() => expect(dialog()).toBeNull());
    expect(followPubkeys).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("confirming tries again with the user's say-so, and moves on", async () => {
    followPubkeys.mockResolvedValueOnce({ success: false, needsBaseConfirmation: true });
    await pressFollow();
    await waitFor(() => expect(dialog()).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("button-new-follow-list-confirm"));

    await waitFor(() => expect(followPubkeys).toHaveBeenCalledTimes(2));
    expect(followPubkeys).toHaveBeenLastCalledWith([THEM], { allowFromScratch: true });
    await waitFor(() => expect(navigate).toHaveBeenCalled());
  });

  it("a list found on a named relay is merged onto, not replaced", async () => {
    const found = { id: "f".repeat(64), kind: 3, tags: [["p", "c".repeat(64)]] };
    followPubkeys.mockResolvedValueOnce({ success: false, needsBaseConfirmation: true });
    recoverFollowListFromRelay.mockResolvedValue({ found: true, follows: 1, event: found } as never);
    await pressFollow();
    await waitFor(() => expect(dialog()).toBeInTheDocument());

    fireEvent.change(screen.getByTestId("input-recovery-relay"), { target: { value: "wss://my.relay" } });
    fireEvent.click(screen.getByTestId("button-search-relay"));

    await waitFor(() => expect(followPubkeys).toHaveBeenCalledTimes(2));
    expect(followPubkeys).toHaveBeenLastCalledWith([THEM], { cachedBase: found });
  });

  it("says so when the publish simply failed, without asking anything", async () => {
    followPubkeys.mockResolvedValue({ success: false, error: "Relays refused" });

    await pressFollow();

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls.at(-1)?.[0]).toMatchObject({ variant: "destructive" });
    expect(dialog()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });
});
