// @vitest-environment jsdom
/**
 * Which site an Assistant belongs to, proven rather than claimed: the host of
 * its NIP-05, but only once that NIP-05 verifies for its key. A Brainstorm
 * Assistant's profile names its deployment there — `…@brainstorm-staging…`,
 * `…@brainstorm.nosfabrica.com` — and the profile's `website` is only a claim.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const KEY = "a".repeat(64);
const h = vi.hoisted(() => ({
  profile: undefined as undefined | { nip05?: string; website?: string },
  status: "unknown" as string,
}));
vi.mock("@/hooks/useLiveProfile", () => ({
  useLiveProfile: () => ({ profile: h.profile, event: undefined, loading: false }),
}));
vi.mock("@/hooks/useNip05", () => ({ useNip05: () => h.status }));

import { useVerifiedHost } from "./useVerifiedHost";

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
