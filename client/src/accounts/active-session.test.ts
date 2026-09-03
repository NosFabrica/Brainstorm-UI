/**
 * "Am I signed in?" — the question ~20 call sites used to answer by reading a
 * single global token row. It is the Active Account's Session now, which is what
 * makes the answer per-Account.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { stubAccount } from "@/test/accountStub";

const active = vi.hoisted(() => ({ account: undefined as unknown }));
vi.mock("./signing", () => ({ activeAccount: () => active.account, canSignSilently: async () => true }));

import { activeHasSession } from "./session";

beforeEach(() => {
  active.account = undefined;
});

describe("the active account's session", () => {
  it("is absent while nobody is signed in", () => {
    expect(activeHasSession()).toBe(false);
  });

  it("is absent for an Account that is listed but holds no token", () => {
    active.account = stubAccount();
    expect(activeHasSession()).toBe(false);
  });

  it("is present once that Account holds one", () => {
    active.account = stubAccount("a-token");
    expect(activeHasSession()).toBe(true);
  });
});
