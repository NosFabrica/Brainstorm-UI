import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import { renderWithProviders } from "@/test/utils";
import { ProfileEditForm } from "./ProfileEditForm";

const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);

const display = vi.fn<() => { pubkey: string; displayName?: string } | null>();
const publishProfile = vi.fn(async () => ({ success: true }));
const fetchProfile = vi.fn(async (_pubkey: string) => null as unknown);
const fetchProfileEvent = vi.fn(async (_pubkey: string) => null as unknown);

vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => display(),
}));
vi.mock("@/services/nostr", () => ({
  publishProfile: (...args: unknown[]) => publishProfile(...(args as [])),
  fetchProfile: (pubkey: string) => fetchProfile(pubkey),
  fetchProfileEvent: (pubkey: string) => fetchProfileEvent(pubkey),
}));

/** Alice's kind-0, carrying content keys and NIP-39 tags the form doesn't manage. */
const ALICE_EVENT = {
  pubkey: ALICE,
  tags: [
    ["i", "github:alice", "proof-alice"],
    ["alias", "alice-only"],
  ],
  content: JSON.stringify({ name: "Alice", about: "Alice's bio", lud06: "alice-lnurl" }),
};

beforeEach(() => {
  vi.clearAllMocks();
  display.mockReturnValue({ pubkey: ALICE, displayName: "Alice" });
  fetchProfile.mockResolvedValue(null);
  fetchProfileEvent.mockResolvedValue(null);
});

/**
 * Re-renders without remounting — which is what in-app switching does. A plain
 * `rerender` would rebuild the tree and reset the state, hiding the bug.
 */
function Harness() {
  const [, bump] = useState(0);
  return (
    <>
      <button data-testid="bump" onClick={() => bump((n) => n + 1)} />
      <ProfileEditForm />
    </>
  );
}

/** Switch the active account under a form that stays mounted. */
async function switchTo(pubkey: string, event: unknown) {
  display.mockReturnValue({ pubkey, displayName: pubkey.slice(0, 3) });
  fetchProfileEvent.mockResolvedValue(event);
  fireEvent.click(screen.getByTestId("bump"));
  await waitFor(() => expect(fetchProfileEvent).toHaveBeenCalledWith(pubkey));
}

async function save() {
  fireEvent.click(screen.getByTestId("button-edit-profile"));
  fireEvent.click(screen.getByTestId("button-edit-save"));
  await waitFor(() => expect(publishProfile).toHaveBeenCalled());
  const [content, tags] = publishProfile.mock.calls[0] as unknown as [
    Record<string, unknown>,
    string[][],
  ];
  return { content, tags };
}

/**
 * The form merges onto the account's existing kind-0 so keys it doesn't manage
 * (lud06, bot, custom) and non-`i` tags survive a save. That base is captured
 * once and guarded by `baseLoaded`, which the account-switch reset has to clear
 * along with the visible fields — in-app switching doesn't remount this.
 */
describe("switching accounts while the profile form is open", () => {
  it("does not publish the previous account's content keys", async () => {
    fetchProfileEvent.mockResolvedValue(ALICE_EVENT);
    renderWithProviders(<Harness />);
    await waitFor(() => expect(fetchProfileEvent).toHaveBeenCalledWith(ALICE));

    // Bob has no kind-0 at all — the worst case, since nothing overwrites a base
    // left behind.
    await switchTo(BOB, null);

    const { content } = await save();

    expect(content).not.toHaveProperty("lud06");
    expect(content.about).toBeUndefined();
  });

  it("does not publish the previous account's linked accounts", async () => {
    fetchProfileEvent.mockResolvedValue(ALICE_EVENT);
    renderWithProviders(<Harness />);
    await waitFor(() => expect(fetchProfileEvent).toHaveBeenCalledWith(ALICE));

    await switchTo(BOB, null);

    const { tags } = await save();

    expect(tags.filter((tag) => tag[0] === "i")).toEqual([]);
  });

  // `i` tags are rebuilt from the editor state, which the switch does reset, so
  // those were never the leak — the non-`i` tags carried through `mergeTags` are.
  it("does not publish the previous account's other tags", async () => {
    fetchProfileEvent.mockResolvedValue(ALICE_EVENT);
    renderWithProviders(<Harness />);
    await waitFor(() => expect(fetchProfileEvent).toHaveBeenCalledWith(ALICE));

    await switchTo(BOB, null);

    const { tags } = await save();

    expect(tags).not.toContainEqual(["alias", "alice-only"]);
  });

  /**
   * The reset handles the synchronous half. The fetches started for the previous
   * account are still in flight, and land *after* it — repopulating the base,
   * setting `baseLoaded` so the submit-time re-fetch guard is skipped again, and
   * refilling the blanked fields through `setName((v) => v || …)`.
   */
  it("ignores a fetch for the account it has already switched away from", async () => {
    let landAlice!: (event: unknown) => void;
    fetchProfileEvent.mockImplementationOnce(
      () => new Promise((resolve) => (landAlice = resolve)),
    );
    renderWithProviders(<Harness />);
    await waitFor(() => expect(fetchProfileEvent).toHaveBeenCalledWith(ALICE));

    await switchTo(BOB, null);
    landAlice(ALICE_EVENT);
    await waitFor(() => expect(fetchProfileEvent).toHaveBeenCalledTimes(2));

    const { content, tags } = await save();

    expect(content).not.toHaveProperty("lud06");
    expect(tags).not.toContainEqual(["alias", "alice-only"]);
  });

  // The merge is the point of the base — losing it would silently drop keys the
  // form doesn't manage, which is the bug the base was added to prevent.
  it("still merges onto the account it is actually editing", async () => {
    fetchProfileEvent.mockResolvedValue(ALICE_EVENT);
    renderWithProviders(<ProfileEditForm />);
    await waitFor(() => expect(fetchProfileEvent).toHaveBeenCalledWith(ALICE));

    const { content, tags } = await save();

    expect(content.lud06).toBe("alice-lnurl");
    expect(tags).toContainEqual(["alias", "alice-only"]);
  });
});
