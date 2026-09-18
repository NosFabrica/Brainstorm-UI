// @vitest-environment jsdom
/**
 * What one run did, read back to the admin: counts, every list it touched,
 * and — when nothing was published — why, in words, with the next step.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { TrustedListRunData } from "@/services/api";
const loadTrustedList = vi.fn();
vi.mock("./listMembers", () => ({ loadTrustedList: (...a: unknown[]) => loadTrustedList(...a) }));
vi.mock("@/services/nostr", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/nostr")>()),
  fetchProfileMap: async () => new Map([["d".repeat(64), { name: "Vitor Pamplona" }]]),
}));

import { TrustedListRunResult } from "./TrustedListRunResult";

const EMPTY: TrustedListRunData = {
  observer: "b".repeat(64),
  signing_pubkey: "c".repeat(64),
  taggings_in_store: 0,
  qualifying_asserters: 0,
  dictionary_size: 0,
  published: 0,
  failed: 0,
  retracted: 0,
  empty_reason: null,
  tags: [],
};

describe("TrustedListRunResult", () => {
  it.each([
    ["no_taggings_ingested", /no taggings have reached the server yet/i],
    ["no_qualifying_asserters", /calculate it from the users tab/i],
    ["no_tags_met_use_threshold", /older lists were retracted/i],
  ] as const)("explains an empty run (%s) and what to do next", (reason, words) => {
    render(<TrustedListRunResult run={{ ...EMPTY, empty_reason: reason }} observerName="Vitor" />);
    expect(screen.getByTestId("trusted-lists-empty")).toHaveTextContent(words);
  });

  const WITH_LISTS: TrustedListRunData = {
    ...EMPTY,
    qualifying_asserters: 3,
    dictionary_size: 2,
    published: 1,
    failed: 1,
    tags: [
      { slug: "podcaster", d_tag: "tl-tag-bbbbbbbb-aaaaaaaa-podcaster", tag_event_id: "e".repeat(64), status: "published", taggings_considered: 5, member_count: 3, error: null },
      { slug: "bitcoiner", d_tag: "tl-tag-bbbbbbbb-aaaaaaaa-bitcoiner", tag_event_id: "f".repeat(64), status: "failed", taggings_considered: 4, member_count: 2, error: "relay said: rate-limited" },
    ],
  };

  it("shows why a list failed to publish, on its own row", () => {
    render(<TrustedListRunResult run={WITH_LISTS} observerName="Vitor" />);
    expect(screen.getByTestId("trusted-list-row-bitcoiner")).toHaveTextContent("relay said: rate-limited");
    expect(screen.getByTestId("trusted-list-row-podcaster")).not.toHaveTextContent("rate-limited");
  });

  // On a phone a list's details take their own line under its name; on a desk
  // they sit beside it.
  it("wraps a list's details under its name on a phone", () => {
    render(<TrustedListRunResult run={WITH_LISTS} observerName="Vitor" />);
    const meta = screen.getByTestId("trusted-list-meta-podcaster");
    expect(meta).toHaveClass("basis-full");
    expect(meta).toHaveClass("sm:basis-auto");
  });

  // Counts say how big a list is; the members say whether it's right.
  it("shows a published list's members, read back from the relay, with a link to it", async () => {
    loadTrustedList.mockResolvedValue({
      members: [{ pubkey: "d".repeat(64), score: 87, endorsements: 3, disputes: 0 }],
      retracted: false,
      relay: "wss://tl.example",
      naddr: "naddr1example",
    });
    renderWithProviders(<TrustedListRunResult run={WITH_LISTS} observerName="Vitor" />);

    fireEvent.click(screen.getByTestId("trusted-list-view-podcaster"));

    const members = await screen.findByTestId("trusted-list-members-podcaster");
    expect(await screen.findByText("Vitor Pamplona")).toBeInTheDocument();
    expect(members).toHaveTextContent("87");
    expect(loadTrustedList).toHaveBeenCalledWith({
      observer: WITH_LISTS.observer,
      signingPubkey: WITH_LISTS.signing_pubkey,
      dTag: "tl-tag-bbbbbbbb-aaaaaaaa-podcaster",
    });
    expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
    // A list that failed to publish has nothing to read back.
    expect(screen.queryByTestId("trusted-list-view-bitcoiner")).toBeNull();
  });
});
