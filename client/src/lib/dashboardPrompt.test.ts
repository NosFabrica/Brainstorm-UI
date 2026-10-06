/**
 * The dashboard carries ONE prompt at a time, as a line in the status strip:
 * the header's Finish-setup pill already lists everything else. A returning
 * user with activation pending, scores just published and the invite card
 * never seen used to get three panels at once (seen on staging, 2026-10-05).
 */
import { describe, expect, it } from "vitest";
import { dashboardPrompt } from "./dashboardPrompt";

describe("dashboardPrompt", () => {
  it("activation outranks everything: it is the one thing other apps need from the user", () => {
    expect(dashboardPrompt({ activatePending: true, consentDue: true, inviteDue: true })).toEqual({
      key: "activate",
      label: "Not visible in apps yet",
      action: "Activate Brainstorm",
    });
  });

  it("the consent re-ask comes before the invite", () => {
    expect(dashboardPrompt({ activatePending: false, consentDue: true, inviteDue: true })?.key).toBe("consent");
  });

  it("with scores live and nothing owed, the invite is the prompt", () => {
    expect(dashboardPrompt({ activatePending: false, consentDue: false, inviteDue: true })).toEqual({
      key: "invite",
      label: "Your network is live",
      action: "Invite friends",
    });
  });

  it("nothing to prompt → no line at all", () => {
    expect(dashboardPrompt({ activatePending: false, consentDue: false, inviteDue: false })).toBeNull();
  });
});
