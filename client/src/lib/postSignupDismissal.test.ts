import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { dismissPostSignup, isPostSignupDismissed, usePostSignupDismissed } from "./postSignupDismissal";

const PUBKEY = "a".repeat(64);
const OTHER = "b".repeat(64);

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("putting the post-signup card away", () => {
  it("is remembered for the account it was dismissed on, and nobody else", () => {
    dismissPostSignup(PUBKEY);

    expect(isPostSignupDismissed(PUBKEY)).toBe(true);
    expect(isPostSignupDismissed(OTHER)).toBe(false);
  });

  // The account arrives after the first render, so anything asking before it
  // lands must get "no" and be free to ask again rather than cache the answer.
  it("says no when there is no account to ask about", () => {
    expect(isPostSignupDismissed(undefined)).toBe(false);
    expect(isPostSignupDismissed("")).toBe(false);
  });

  // The recurring reminder waits behind this card and is its sibling, so it has
  // to hear the dismissal rather than wait for an unrelated re-render.
  it("tells whoever is watching, at once", () => {
    const { result } = renderHook(() => usePostSignupDismissed(OTHER));
    expect(result.current).toBe(false);

    act(() => dismissPostSignup(OTHER));

    expect(result.current).toBe(true);
  });

  it("stays dismissed for this tab even where storage refuses the write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });

    dismissPostSignup(PUBKEY);

    expect(isPostSignupDismissed(PUBKEY)).toBe(true);
  });
});
