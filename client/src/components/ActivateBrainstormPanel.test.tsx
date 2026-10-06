import { describe, expect, it } from "vitest";

import { needsActivationPrompt } from "./ActivateBrainstormPanel";

describe("needsActivationPrompt", () => {
  it("stays hidden until the relay check settles", () => {
    expect(needsActivationPrompt({ status: undefined, locallyActivated: false, createdInApp: false })).toBe(false);
  });

  it("stays hidden when the check errored — never flash a guess", () => {
    expect(needsActivationPrompt({ status: "unknown", locallyActivated: false, createdInApp: false })).toBe(false);
  });

  it("never prompts in-app-created accounts (the consent card is their surface)", () => {
    expect(needsActivationPrompt({ status: "none", locallyActivated: false, createdInApp: true })).toBe(false);
    expect(needsActivationPrompt({ status: "other", locallyActivated: false, createdInApp: true })).toBe(false);
  });

  it("prompts an account with no kind-10040", () => {
    expect(needsActivationPrompt({ status: "none", locallyActivated: false, createdInApp: false })).toBe(true);
  });

  // Relays are eventually-consistent; once we've published, a miss is lag, not
  // a deactivation (mirrors nip85Activation.ts).
  it("does not re-prompt on a relay miss once locally activated", () => {
    expect(needsActivationPrompt({ status: "none", locallyActivated: true, createdInApp: false })).toBe(false);
  });

  it("prompts when the 10040 points at a different provider, even if locally activated", () => {
    expect(needsActivationPrompt({ status: "other", locallyActivated: true, createdInApp: false })).toBe(true);
  });

  it("stays hidden when the 10040 already declares Brainstorm", () => {
    expect(needsActivationPrompt({ status: "brainstorm", locallyActivated: false, createdInApp: false })).toBe(false);
  });
});
