import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import { renderWithProviders } from "@/test/utils";

const PUBKEY = "a".repeat(64);

const toast = vi.fn();
const followPubkeys = vi.fn(async (_pks: string[], _opts?: { allowFromScratch?: boolean }): Promise<Record<string, unknown>> => ({ success: true }));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => ({ pubkey: PUBKEY, npub: "npub1lira", displayName: "Lira" }),
}));
vi.mock("@/services/socialActions", () => ({
  followPubkeys: (...a: unknown[]) => followPubkeys(...(a as [string[]])),
  recoverFollowListFromRelay: vi.fn(async () => ({ found: false })),
}));
vi.mock("@/services/trustAnchor", () => ({
  triggerScoringAndAnchor: vi.fn(async () => {}),
  publishBrainstormTrustAnchor: vi.fn(async () => ({ status: "success" })),
  checkExistingTrustProvider: vi.fn(async () => "none"),
}));
vi.mock("@/hooks/useSelf", () => ({
  useSelfHistory: () => ({ data: undefined, isSuccess: false }),
}));
vi.mock("@/lib/nip85Activation", () => ({ isNip85Activated: () => false }));
vi.mock("@/services/nostr", () => ({
  fetchProfileMap: vi.fn(async () => new Map()),
  SEED_FOLLOW_HEX: "b".repeat(64),
}));
vi.mock("@/lib/profileSearch", () => ({ searchByText: vi.fn(async () => ({ results: [] })) }));
vi.mock("@/components/PersonRow", () => ({
  PersonRow: ({ person }: { person: { pubkey: string } }) => <div data-testid={`row-${person.pubkey.slice(0, 8)}`} />,
}));

import { FollowToCalculateCard } from "./FollowToCalculateCard";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  followPubkeys.mockResolvedValue({ success: true });
});

/**
 * The from-scratch confirmation, end to end from the card: `followPubkeys`
 * refusing with `needsBaseConfirmation` must surface the dialog rather than a
 * generic failure, and only an explicit confirm may retry with
 * `allowFromScratch` — cancel leaves everything unpublished.
 */
describe("the first-follow-list confirmation", () => {
  it("opens the dialog instead of toasting a failure", async () => {
    followPubkeys.mockResolvedValue({ success: false, needsBaseConfirmation: true, error: "unconfirmed" });
    const onDone = vi.fn();
    renderWithProviders(<FollowToCalculateCard onDone={onDone} />);

    fireEvent.click(screen.getByTestId("follow-card-commit"));

    await waitFor(() => expect(screen.getByTestId("dialog-confirm-new-follow-list")).toBeInTheDocument());
    expect(onDone).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });

  it("confirm retries with allowFromScratch and completes the flow", async () => {
    followPubkeys.mockResolvedValueOnce({ success: false, needsBaseConfirmation: true, error: "unconfirmed" });
    const onDone = vi.fn();
    renderWithProviders(<FollowToCalculateCard onDone={onDone} />);

    fireEvent.click(screen.getByTestId("follow-card-commit"));
    await waitFor(() => expect(screen.getByTestId("dialog-confirm-new-follow-list")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("button-new-follow-list-confirm"));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(followPubkeys).toHaveBeenLastCalledWith(expect.any(Array), { allowFromScratch: true });
  });

  it("cancel closes the dialog and publishes nothing", async () => {
    followPubkeys.mockResolvedValue({ success: false, needsBaseConfirmation: true, error: "unconfirmed" });
    const onDone = vi.fn();
    renderWithProviders(<FollowToCalculateCard onDone={onDone} />);

    fireEvent.click(screen.getByTestId("follow-card-commit"));
    await waitFor(() => expect(screen.getByTestId("dialog-confirm-new-follow-list")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("button-new-follow-list-cancel"));

    await waitFor(() => expect(screen.queryByTestId("dialog-confirm-new-follow-list")).not.toBeInTheDocument());
    expect(followPubkeys).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("a plain success never shows the dialog", async () => {
    const onDone = vi.fn();
    renderWithProviders(<FollowToCalculateCard onDone={onDone} />);

    fireEvent.click(screen.getByTestId("follow-card-commit"));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(screen.queryByTestId("dialog-confirm-new-follow-list")).not.toBeInTheDocument();
    expect(followPubkeys).toHaveBeenCalledWith(expect.any(Array), undefined);
  });
});
