// @vitest-environment node
import { describe, expect, it } from "vitest";

import { leaveScopedRoute } from "./scoped-routes";

const ALICE = "npub1alice";
const BOB = "npub1bob";

describe("leaving a page that belonged to the previous identity", () => {
  it.each(["/settings", "/admin", "/agentsuite", "/onboarding", "/setup"])(
    "leaves %s, which renders your own data",
    (page) => {
      expect(leaveScopedRoute(page)).toBe("/dashboard");
    },
  );

  it("leaves a sub-page of one too", () => {
    expect(leaveScopedRoute("/settings/relays")).toBe("/dashboard");
  });

  it("follows your own profile across to the new identity's", () => {
    expect(leaveScopedRoute(`/profile/${ALICE}`, { previousNpub: ALICE, nextNpub: BOB })).toBe(
      `/profile/${BOB}`,
    );
  });

  it("stays on someone else's profile — it reads the same either way", () => {
    expect(leaveScopedRoute("/profile/npub1carol", { previousNpub: ALICE, nextNpub: BOB })).toBeNull();
  });

  it("stays on pages that are about the network, not about you", () => {
    expect(leaveScopedRoute("/")).toBeNull();
    expect(leaveScopedRoute("/network")).toBeNull();
    expect(leaveScopedRoute("/p/npub1carol")).toBeNull();
  });

  it("ignores the query string when deciding", () => {
    expect(leaveScopedRoute("/settings?tab=profile")).toBe("/dashboard");
  });
});
