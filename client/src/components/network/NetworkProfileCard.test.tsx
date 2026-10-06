// @vitest-environment jsdom
/**
 * A person's row on the Network page carries ONE trust signal, the shared one:
 * the avatar ring (and the coin where the display mode calls for it), in the
 * tier colours every other list uses. The hand-drawn hollow circle beside each
 * row is gone — in Word mode it was an empty ring in its own palette, and it
 * never showed Flagged. Chips say which way a relationship runs in plain words.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TRUST_TIER_COLORS } from "@/services/trustThreshold";
import { NetworkCardActionsProvider, NetworkCardViewProvider } from "./cardContext";
import type { GroupKey } from "./networkGroups";

let displayMode: "number" | "level" | "tier" | "word" | "off" = "word";
vi.mock("@/hooks/useScoreDisplayMode", () => ({ useScoreDisplayMode: () => [displayMode, () => {}] }));
vi.mock("@/hooks/useTierGranularity", () => ({ useTierGranularity: () => ["simple", () => {}] }));
vi.mock("@/components/messages/MessageButton", () => ({ MessageButton: () => null }));

import { NetworkProfileCard } from "./NetworkProfileCard";

const PK = "a".repeat(64);
const groupsOf: GroupKey[] = ["followed_by"];
const actions = {
  trustCacheRef: { current: new Map() },
  activeGroupRef: { current: "followed_by" },
  getPubkeyGroups: () => groupsOf,
  onToggleExpanded: vi.fn(),
  onCopyNpub: vi.fn(),
  onCloseDetail: vi.fn(),
  onNavigate: vi.fn(),
  onFollow: vi.fn(),
  onUnfollow: vi.fn(),
  onMute: vi.fn(),
  onUnmute: vi.fn(),
};

function show({ score = 0.4, flagged = false }: { score?: number | null; flagged?: boolean } = {}) {
  render(
    <TooltipProvider>
      <NetworkCardActionsProvider value={actions}>
        <NetworkCardViewProvider
          value={{ viewMode: "list", socialPending: false, socialListsLoading: false, pov: "personalized" }}
        >
          <NetworkProfileCard
            pk={PK}
            profile={{ name: "Vitor Pamplona" }}
            trustScore={score}
            graphData={undefined}
            detail={undefined}
            stats={undefined}
            isExpanded={false}
            isCopied={false}
            isProfileLoaded
            profileAttempted
            expandedLoading={false}
            isSelf={false}
            isFollowingUser={false}
            isMutedUser={false}
            isFlagged={flagged}
          />
        </NetworkCardViewProvider>
      </NetworkCardActionsProvider>
    </TooltipProvider>,
  );
  return screen.getByTestId(`card-profile-${PK.slice(0, 8)}`);
}
/** The avatar is the element wearing the tier ring; find it by its fallback initial. */
const avatarOf = (row: HTMLElement) => within(row).getByText("V").closest("span")!.parentElement!;

beforeEach(() => {
  displayMode = "word";
});

describe("NetworkProfileCard row", () => {
  it("in Word mode the avatar ring is the only trust mark: cyan for verified, no circle, no digits", () => {
    const row = show({ score: 0.4 });
    expect(avatarOf(row).className).toContain(TRUST_TIER_COLORS.trusted);
    expect(within(row).queryByTestId(/^badge-trust-/)).toBeNull();
    // The coin stays for screen readers only; the ring stands in for it on screen.
    expect(within(row).getByTestId("verification-coin").className).toContain("sr-only");
    // No score shown anywhere on screen: the row's only text is the name, the npub and the chip.
    const coin = within(row).getByTestId("verification-coin");
    const visibleText = row.textContent!.replace(coin.textContent ?? "", "");
    expect(visibleText.replace(/npub1\w+/, "")).not.toMatch(/\d/);
  });

  it("in Number mode the shared coin shows the number", () => {
    displayMode = "number";
    const row = show({ score: 0.4 });
    expect(within(row).getByTestId("verification-coin")).toHaveTextContent("40");
    expect(within(row).queryByTestId(/^badge-trust-/)).toBeNull();
  });

  it("in Off mode there is no ring and no coin", () => {
    displayMode = "off";
    const row = show({ score: 0.4 });
    expect(avatarOf(row).className).not.toContain("shadow-[");
    expect(within(row).queryByTestId("verification-coin")).toBeNull();
  });

  it("a flagged account wears the red ring, whatever its score", () => {
    const row = show({ score: 0.4, flagged: true });
    expect(avatarOf(row).className).toContain(TRUST_TIER_COLORS.flagged);
  });

  it("says which way the relationship runs: 'Follows you', not 'Followers'", () => {
    const row = show();
    expect(within(row).getByTestId(`badge-group-followed_by-${PK.slice(0, 8)}`)).toHaveTextContent("Follows you");
  });
});
