import { describe, expect, it } from "vitest";
import { isValidEmail } from "./email";

describe("isValidEmail", () => {
  it("accepts ordinary addresses", () => {
    expect(isValidEmail("ben@practicepilot.ai")).toBe(true);
    expect(isValidEmail("support@nosfabrica.com")).toBe(true);
    expect(isValidEmail("a.b+tag@sub.domain.co")).toBe(true);
  });

  it("rejects the obviously wrong, without playing RFC lawyer", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("missing@tld")).toBe(false);
    expect(isValidEmail("two@@ats.com")).toBe(false);
    expect(isValidEmail("spaces in@it.com")).toBe(false);
  });
});
