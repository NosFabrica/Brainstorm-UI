import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

import { renderWithProviders } from "@/test/utils";
import OnboardingWizard from "./OnboardingWizard";

const PUBKEY = "a".repeat(64);

const navigate = vi.fn();
const toast = vi.fn();
const canBackUp = vi.fn(() => true);

vi.mock("wouter", () => ({ useLocation: () => ["/setup", navigate] }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => ({ pubkey: PUBKEY, npub: "npub1lira", displayName: "Lira" }),
}));
vi.mock("@/services/nostr", () => ({
  publishProfile: vi.fn(async () => {}),
}));
vi.mock("@/services/trustAnchor", () => ({
  triggerScoringAndAnchor: vi.fn(async () => {}),
}));
vi.mock("@/services/socialActions", () => ({
  followPubkeys: vi.fn(async () => ({ success: true })),
}));
vi.mock("@/accounts/backup", () => ({ canBackUp: () => canBackUp() }));
vi.mock("@/components/ImageUpload", () => ({ ImageUpload: () => null }));
vi.mock("@/components/FollowPicker", () => ({
  FollowPicker: ({ onContinue }: { onContinue: (pks: string[]) => void }) => (
    <button type="button" data-testid="fake-follow-continue" onClick={() => onContinue(["b".repeat(64)])}>
      Follow &amp; continue
    </button>
  ),
}));
vi.mock("@/components/OnboardingBackupStep", () => ({
  OnboardingBackupStep: ({ onSkip }: { onSkip: () => void }) => (
    <div data-testid="onboarding-step-backup">
      <button type="button" data-testid="onboarding-backup-skip" onClick={onSkip}>
        Skip for now
      </button>
    </div>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  canBackUp.mockReturnValue(true);
});

describe("where the backup step sits", () => {
  it("stays last — profile, then network, then backup", () => {
    renderWithProviders(<OnboardingWizard />);
    expect(screen.getByTestId("onboarding-step-profile")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("onboarding-profile-skip"));
    expect(screen.getByTestId("onboarding-step-follow")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("fake-follow-continue"));
    expect(screen.getByTestId("onboarding-step-backup")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-progress").children).toHaveLength(3);
  });

  // Nothing to back up: an extension or a bunker holds the key, not this browser.
  it("isn't offered at all when the key isn't ours to hand over", () => {
    canBackUp.mockReturnValue(false);
    renderWithProviders(<OnboardingWizard />);
    fireEvent.click(screen.getByTestId("onboarding-profile-skip"));
    expect(screen.getByTestId("onboarding-progress").children).toHaveLength(2);

    fireEvent.click(screen.getByTestId("fake-follow-continue"));

    expect(screen.queryByTestId("onboarding-step-backup")).not.toBeInTheDocument();
    expect(navigate).toHaveBeenCalledWith("/", { replace: true });
  });

  // Skipping is allowed by decision — the post-signup card and the recurring
  // reminder are what stand between them and an unrecoverable account.
  it("lets them leave without a backup", () => {
    renderWithProviders(<OnboardingWizard />);
    fireEvent.click(screen.getByTestId("onboarding-profile-skip"));
    fireEvent.click(screen.getByTestId("fake-follow-continue"));

    fireEvent.click(screen.getByTestId("onboarding-backup-skip"));

    expect(navigate).toHaveBeenCalledWith("/", { replace: true });
  });
});
