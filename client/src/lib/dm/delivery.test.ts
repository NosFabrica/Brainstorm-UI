import { describe, expect, it } from "vitest";
import { deliveryOutcome } from "./delivery";

const at = { recipient: "a".repeat(64), relay: "wss://relay.example/" };

describe("deliveryOutcome", () => {
  it("accepts", () => {
    expect(deliveryOutcome({ ...at, ok: true, message: "" })).toEqual({ label: "Accepted" });
  });

  it("shows the relay's own reason for a refusal", () => {
    expect(deliveryOutcome({ ...at, ok: false, message: "restricted: not an invited member" })).toEqual({
      label: "Refused",
      detail: "restricted: not an invited member",
    });
  });

  it("tells an unreachable relay from a refusal", () => {
    expect(deliveryOutcome({ ...at, ok: false, message: "Could not connect", unreachable: true })).toEqual({
      label: "Couldn't connect",
    });
  });

  it("reads silence as no answer, keeping a NOTICE sent instead of an OK", () => {
    expect(deliveryOutcome({ ...at, ok: false, message: "Timeout" })).toEqual({ label: "No answer" });
    expect(deliveryOutcome({ ...at, ok: false, message: "Timeout", notice: "rate limited" })).toEqual({
      label: "No answer",
      detail: "NOTICE: rate limited",
    });
  });

  it("keeps the reason on a sign-in refusal", () => {
    expect(deliveryOutcome({ ...at, ok: false, auth: true, message: "auth-required: sign in first" })).toEqual({
      label: "Needs sign-in",
      detail: "auth-required: sign in first",
    });
  });
});
