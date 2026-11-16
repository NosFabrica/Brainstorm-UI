/**
 * The note about disagreeing on `/tags/mine` is advice about tags that exist.
 * On a page with none (every new account) it was a paragraph about votes and
 * take-backs before there was anything to vote on, so it waits for a tag.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MyAssertion, ProfileTagsResult } from "@/services/tags";

const ME = "a".repeat(64);
const OTHER = "b".repeat(64);

const h = vi.hoisted(() => ({
  onMe: undefined as unknown,
  said: undefined as unknown,
  loading: false,
}));
vi.mock("@/hooks/useTags", () => ({
  useProfileTags: () => ({ data: h.onMe, isLoading: h.loading }),
  useMyAssertions: () => ({ data: h.said, isLoading: h.loading }),
  usePinnedTags: () => ({ data: [] }),
  useApplyTag: () => ({ mutate: vi.fn(), isPending: false }),
  useTogglePin: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ pubkey: ME }) }));
vi.mock("@/hooks/useLiveProfile", () => ({ useLiveProfiles: () => new Map() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { YourTagsPanel } from "./YourTagsPanel";

const nothingOnMe: ProfileTagsResult = { tags: [], mine: [], trustUnverified: false, viewerUnscored: false };
const oneSaid: MyAssertion = {
  key: `${OTHER}:coffee`,
  authorPubkey: OTHER,
  slug: "coffee",
  name: "Coffee",
  target: OTHER,
  targetKind: "pubkey",
  stance: "apply",
  at: 1_700_000_000,
};

describe("the note about disagreeing on Your tags", () => {
  beforeEach(() => {
    h.onMe = nothingOnMe;
    h.said = [];
    h.loading = false;
  });

  it("stays off a page with no tags on it", () => {
    render(<YourTagsPanel />);
    expect(screen.getByText("Nobody has tagged you yet")).toBeInTheDocument();
    expect(screen.queryByTestId("my-tags-no-delete")).toBeNull();
  });

  it("is there once the person has tagged someone", () => {
    h.said = [oneSaid];
    render(<YourTagsPanel />);
    expect(screen.getByTestId("my-tags-no-delete")).toHaveTextContent("See a tag that's wrong? Disagree with it.");
  });

  it("is there once someone has tagged them", () => {
    h.onMe = {
      ...nothingOnMe,
      tags: [
        {
          key: `${OTHER}:coffee`,
          authorPubkey: OTHER,
          slug: "coffee",
          name: "Coffee",
          applications: 1,
          disputes: 0,
          asserters: [OTHER],
          selfDeclared: false,
          subjectDisagreed: false,
          counted: true,
          sharesName: 0,
          addedAt: 1_700_000_000,
        },
      ],
    };
    render(<YourTagsPanel />);
    expect(screen.getByTestId("my-tags-no-delete")).toBeInTheDocument();
  });

  it("doesn't flash in while the tags are still loading", () => {
    h.onMe = undefined;
    h.said = undefined;
    h.loading = true;
    render(<YourTagsPanel />);
    expect(screen.queryByTestId("my-tags-no-delete")).toBeNull();
  });
});
