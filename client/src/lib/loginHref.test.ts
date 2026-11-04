/**
 * Where a sign-in link sends a reader: /login, carrying the page they're on —
 * query included — so they come back to it (a search's results, not a bare home).
 */
import { describe, expect, it } from "vitest";
import { loginHref } from "./loginHref";

describe("loginHref", () => {
  it("carries a search's query, so signing in returns to its results", () => {
    expect(loginHref("/", "q=jack")).toBe("/login?next=%2F%3Fq%3Djack");
  });

  it("carries a plain page", () => {
    expect(loginHref("/profile/npub1abc", "")).toBe("/login?next=%2Fprofile%2Fnpub1abc");
  });

  it("from the home or /login itself, there's nothing to return to", () => {
    expect(loginHref("/", "")).toBe("/login");
    expect(loginHref("/login", "next=%2F")).toBe("/login");
  });
});
