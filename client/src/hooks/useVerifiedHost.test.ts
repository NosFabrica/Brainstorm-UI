// @vitest-environment jsdom
/**
 * Which site an Assistant belongs to, proven rather than claimed: the host of
 * its NIP-05, but only once that NIP-05 verifies for its key. A Brainstorm
 * Assistant's profile names its deployment there — `…@brainstorm-staging…`,
 * `…@brainstorm.nosfabrica.com` — and the profile's `website` is only a claim.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const KEY = "a".repeat(64);
const h = vi.hoisted(() => ({
  profile: undefined as undefined | { nip05?: string; website?: string },
  status: "unknown" as string,
}));
// For the list form: each key's profile, and the handles already checked.
const many = vi.hoisted(() => ({
  profiles: new Map<string, { nip05?: string; website?: string }>(),
  checked: new Map<string, string>(),
  /** The check answers once this resolves. */
  answer: Promise.resolve(),
}));
vi.mock("@/hooks/useLiveProfile", () => ({
  useLiveProfile: () => ({ profile: h.profile, event: undefined, loading: false }),
  useLiveProfiles: () => many.profiles,
}));
vi.mock("@/hooks/useNip05", () => ({ useNip05: () => h.status }));
vi.mock("@/lib/nip05", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  peekNip05: (nip05: string, pubkey: string) => many.checked.get(`${nip05}|${pubkey}`),
  // The check answers "verified", and is remembered as the real one is.
  verifyNip05: async (nip05: string, pubkey: string) => {
    await many.answer;
    many.checked.set(`${nip05}|${pubkey}`, "verified");
    return "verified";
  },
}));

import { useVerifiedHost, useVerifiedHosts } from "./useVerifiedHost";

describe("useVerifiedHost", () => {
  beforeEach(() => {
    h.profile = { nip05: "assistant@brainstorm.nosfabrica.com", website: "https://brainstorm.nosfabrica.com" };
    h.status = "verified";
  });

  it("is the NIP-05's host once it verifies for the key", () => {
    expect(renderHook(() => useVerifiedHost(KEY)).result.current).toBe("brainstorm.nosfabrica.com");
  });

  it("is nothing while unchecked or when it doesn't verify — a website alone proves nothing", () => {
    h.status = "unknown";
    expect(renderHook(() => useVerifiedHost(KEY)).result.current).toBeNull();
    h.status = "invalid";
    expect(renderHook(() => useVerifiedHost(KEY)).result.current).toBeNull();
  });

  it("is nothing with no NIP-05, no profile, or no key", () => {
    h.profile = { website: "https://brainstorm.nosfabrica.com" };
    expect(renderHook(() => useVerifiedHost(KEY)).result.current).toBeNull();
    h.profile = undefined;
    expect(renderHook(() => useVerifiedHost(KEY)).result.current).toBeNull();
    expect(renderHook(() => useVerifiedHost(null)).result.current).toBeNull();
  });

  it("reads a root identifier (_@host) as its host", () => {
    h.profile = { nip05: "_@brainstorm-staging.nosfabrica.com" };
    expect(renderHook(() => useVerifiedHost(KEY)).result.current).toBe("brainstorm-staging.nosfabrica.com");
  });
});

/**
 * The same proof for a list of Assistants — every one a Treasure Map names,
 * however many there are. One hook call a key held only while a Map never
 * named more than four.
 */
describe("useVerifiedHosts", () => {
  const A = "a".repeat(64);
  const B = "b".repeat(64);
  const C = "c".repeat(64);

  beforeEach(() => {
    many.profiles = new Map([
      [A, { nip05: "assistant@brainstorm.nosfabrica.com" }],
      [B, { nip05: "_@Pip.Example" }],
      [C, { website: "https://claims.example" }],
    ]);
    many.checked = new Map([
      [`assistant@brainstorm.nosfabrica.com|${A}`, "verified"],
      [`_@Pip.Example|${B}`, "verified"],
    ]);
  });

  it("answers for every key: its NIP-05's host once verified, else nothing", () => {
    const siteOf = renderHook(() => useVerifiedHosts([A, B, C])).result.current;
    expect(siteOf(A)).toBe("brainstorm.nosfabrica.com");
    expect(siteOf(B)).toBe("pip.example");
    expect(siteOf(C)).toBeNull();
    expect(siteOf("d".repeat(64))).toBeNull();
  });

  it("checks a handle it hasn't yet, and answers once it verifies", async () => {
    many.checked = new Map();
    let answered = () => {};
    many.answer = new Promise<void>((resolve) => (answered = resolve));
    const view = renderHook(() => useVerifiedHosts([A]));
    expect(view.result.current(A)).toBeNull();
    answered();
    await waitFor(() => expect(view.result.current(A)).toBe("brainstorm.nosfabrica.com"));
  });

  it("a handle that names someone else proves nothing", () => {
    many.checked = new Map([[`assistant@brainstorm.nosfabrica.com|${A}`, "invalid"]]);
    expect(renderHook(() => useVerifiedHosts([A])).result.current(A)).toBeNull();
  });
});
