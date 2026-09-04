// @vitest-environment node
/**
 * The server speaks in webhook event names and failure codes; admins don't.
 * Benjamin, over the Needs attention rows: "this is just ugly code admins
 * might not understand." These translate — with a fallback that stays
 * readable when Flash or the server adds a word we haven't seen.
 */
import { describe, expect, it } from "vitest";
import { eventLabel, eventTone, failureLabel } from "./billingEventCopy";

describe("eventLabel", () => {
  it("names Flash's subscription events in plain words", () => {
    expect(eventLabel("subscription.activated")).toBe("Subscription started");
    expect(eventLabel("subscription.canceled")).toBe("Subscription cancelled");
    expect(eventLabel("subscription.renewed")).toBe("Subscription renewed");
    expect(eventLabel("subscription.past_due")).toBe("Payment overdue");
    expect(eventLabel("subscription.paused")).toBe("Subscription paused");
    expect(eventLabel("subscription.expired")).toBe("Subscription expired");
  });
  it("keeps an unknown event readable instead of raw", () => {
    expect(eventLabel("subscription.trial_will_end")).toBe("Subscription trial will end");
    expect(eventLabel("invoice.paid")).toBe("Invoice paid");
    expect(eventLabel(undefined)).toBe("Event");
  });
  it("gives each event a tone: good news green, endings neutral, trouble warning", () => {
    expect(eventTone("subscription.activated")).toBe("success");
    expect(eventTone("subscription.canceled")).toBe("neutral");
    expect(eventTone("subscription.past_due")).toBe("warning");
    expect(eventTone("whatever.new")).toBe("neutral");
  });
});

describe("failureLabel", () => {
  it("says why an event couldn't be applied, in the admin's words", () => {
    expect(failureLabel("no_reference")).toBe("Named no account");
    expect(failureLabel("unknown_user")).toBe("No account matches");
    expect(failureLabel("unknown_plan")).toBe("Plan not mapped");
    expect(failureLabel("unknown_subscription")).toBe("Flash has no such subscription");
    expect(failureLabel("reference_mismatch")).toBe("Names a different account");
    expect(failureLabel("blocked")).toBe("Account blocked from billing");
  });
  it("humanizes a code it doesn't know and stays quiet on none", () => {
    expect(failureLabel("vault_on_fire")).toBe("Vault on fire");
    expect(failureLabel(null)).toBeNull();
  });
});
