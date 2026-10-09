// @vitest-environment jsdom
/**
 * The actions beside a profile's avatar. Three bare icons (magnifier, pen,
 * bubble) sat before Follow and ⋯ and nobody could read them (Benjamin,
 * 2026-10-09). Now: a labelled Message, Follow, and the ⋯ menu — the review
 * and the post search moved into the menu, with words.
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { ProfileActions } from "./ProfileActions";

const NPUB = "npub1" + "q".repeat(58);

function show(viewer: { loggedIn: boolean; isOwner: boolean }) {
  render(
    <Router hook={memoryLocation({ path: `/p/${NPUB}` }).hook}>
      <ProfileActions
        viewer={viewer}
        npub={NPUB}
        displayName="Ada"
        follow={viewer.loggedIn && !viewer.isOwner ? <button data-testid="follow-stub">Follow</button> : null}
        menu={<button data-testid="share-actions-menu">⋯</button>}
      />
    </Router>,
  );
}

describe("ProfileActions", () => {
  it("signed in on someone else's page: Message (with the word), Follow and the menu — no bare icons", () => {
    show({ loggedIn: true, isOwner: false });
    const desktop = screen.getByTestId("share-actions-topright");
    const message = within(desktop).getByTestId("share-message");
    expect(message).toHaveTextContent("Message");
    expect(message).toHaveAttribute("href", `/messages/${NPUB}`);
    expect(within(desktop).getByTestId("follow-stub")).toBeInTheDocument();
    expect(within(desktop).getByTestId("share-actions-menu")).toBeInTheDocument();
    expect(screen.queryByTestId("share-review")).toBeNull();
    expect(screen.queryByTestId("share-search-posts")).toBeNull();
  });

  it("on a phone the same Message and menu sit across from the avatar; Follow has its own row", () => {
    show({ loggedIn: true, isOwner: false });
    const phone = screen.getByTestId("share-actions-mobile-top");
    expect(within(phone).getByTestId("share-message")).toHaveTextContent("Message");
    expect(within(phone).getByTestId("share-actions-menu")).toBeInTheDocument();
    // Follow is not squeezed in up here — the page gives it a full-width row of its own.
    expect(within(phone).queryByTestId("follow-stub")).toBeNull();
  });

  it("your own page: no Message, no Follow — just the menu", () => {
    show({ loggedIn: true, isOwner: true });
    expect(screen.queryByTestId("share-message")).toBeNull();
    expect(screen.queryByTestId("follow-stub")).toBeNull();
    expect(screen.getAllByTestId("share-actions-menu").length).toBeGreaterThan(0);
  });

  it("signed out: only the menu", () => {
    show({ loggedIn: false, isOwner: false });
    expect(screen.queryByTestId("share-message")).toBeNull();
    expect(screen.getAllByTestId("share-actions-menu").length).toBeGreaterThan(0);
  });
});
