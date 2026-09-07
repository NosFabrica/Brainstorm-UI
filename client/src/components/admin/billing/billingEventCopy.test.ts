// @vitest-environment node
/**
 * The server speaks in webhook event names and failure codes; admins don't.
 * Benjamin, over the Needs attention rows: "this is just ugly code admins
 * might not understand." These translate — with a fallback that stays
 * readable when Flash or the server adds a word we haven't seen.
 */
import { describe, expect, it } from "vitest";
import { eventLabel, eventTone, failureLabel, sourceLabel, statusLabel } from "./billingEventCopy";

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

// Benjamin, over the roster: chips said `past_due`, `expired`; the Source
// column said `billing`, `admin`, `default`. Admins read words. Unknown
// values still survive, readable.
describe("statusLabel", () => {
  it("says Flash's statuses in plain words, and keeps an unknown one readable", () => {
    expect(statusLabel("active")).toBe("Active");
    expect(statusLabel("past_due")).toBe("Past due");
    expect(statusLabel("pending")).toBe("Pending");
    expect(statusLabel("expired")).toBe("Expired");
    expect(statusLabel("canceled")).toBe("Cancelled");
    expect(statusLabel("trial")).toBe("Trial");
    expect(statusLabel("on_hold_review")).toBe("On hold review");
    expect(statusLabel("")).toBe("Unknown");
  });
});

describe("sourceLabel", () => {
  it("says who set the tier: paid via Flash, an admin, or the default", () => {
    expect(sourceLabel("billing")).toBe("Paid via Flash");
    expect(sourceLabel("admin")).toBe("Admin-set");
    expect(sourceLabel("default")).toBe("Default");
    expect(sourceLabel("manual")).toBe("Manual");
    expect(sourceLabel("legacy_import")).toBe("Legacy import");
  });
});
