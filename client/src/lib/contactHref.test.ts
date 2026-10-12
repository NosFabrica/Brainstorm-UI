/**
 * A fact's value as something to tap: a phone number calls, an email
 * address mails. Anything else is text, a web address included.
 */
import { describe, expect, it } from "vitest";
import { contactHref } from "./contactHref";

describe("contactHref", () => {
  it("a phone number, however spaced, becomes a tel link with only digits and a leading plus", () => {
    expect(contactHref("+1 346 493 2858")).toBe("tel:+13464932858");
    expect(contactHref("(020) 7946-0958")).toBe("tel:02079460958");
  });
  it("an email address becomes a mailto link", () => {
    expect(contactHref("hello@ilsolefood.com")).toBe("mailto:hello@ilsolefood.com");
  });
  it("a web address stays text: whether a field links is its declared type's call, not a guess", () => {
    expect(contactHref("https://www.ilsolefood.com/")).toBeNull();
    expect(contactHref("ilsolefood.com/menu")).toBeNull();
  });
  it("anything else is text: hours, a cuisine, a short number, a year", () => {
    expect(contactHref("Th 17:00-23:00; Fr 17:00-00:00")).toBeNull();
    expect(contactHref("italian")).toBeNull();
    expect(contactHref("2017")).toBeNull();
    expect(contactHref("")).toBeNull();
  });
});
