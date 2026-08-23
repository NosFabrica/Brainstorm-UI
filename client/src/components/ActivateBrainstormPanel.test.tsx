import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

import { renderWithProviders } from "@/test/utils";
import {
  ActivateBrainstormPanel,
  needsActivationPrompt,
  type ActivationCheckResult,
} from "./ActivateBrainstormPanel";

const check = (found: boolean, matches: boolean): ActivationCheckResult => ({ found, matches });

describe("needsActivationPrompt", () => {
  it("stays hidden until the relay check settles", () => {
    expect(
      needsActivationPrompt({ check: undefined, locallyActivated: false, createdInApp: false }),
    ).toBe(false);
  });

  it("never prompts in-app-created accounts (they auto-activate)", () => {
    expect(
      needsActivationPrompt({ check: check(false, false), locallyActivated: false, createdInApp: true }),
    ).toBe(false);
    expect(
      needsActivationPrompt({ check: check(true, false), locallyActivated: false, createdInApp: true }),
    ).toBe(false);
  });

  it("prompts an account with no kind-10040", () => {
    expect(
      needsActivationPrompt({ check: check(false, false), locallyActivated: false, createdInApp: false }),
    ).toBe(true);
  });

  // Relays are eventually-consistent; once we've published, a miss is lag, not
  // a deactivation (mirrors nip85Activation.ts).
  it("does not re-prompt on a relay miss once locally activated", () => {
    expect(
      needsActivationPrompt({ check: check(false, false), locallyActivated: true, createdInApp: false }),
    ).toBe(false);
  });

  it("prompts when the 10040 points at a different provider, even if locally activated", () => {
    expect(
      needsActivationPrompt({ check: check(true, false), locallyActivated: true, createdInApp: false }),
    ).toBe(true);
  });

  it("stays hidden when the 10040 already declares Brainstorm", () => {
    expect(
      needsActivationPrompt({ check: check(true, true), locallyActivated: false, createdInApp: false }),
    ).toBe(false);
  });
});

describe("ActivateBrainstormPanel", () => {
  it("carries the activation copy", () => {
    renderWithProviders(<ActivateBrainstormPanel onActivate={() => {}} />);

    expect(screen.getByTestId("text-activate-brainstorm-title")).toHaveTextContent(
      "Activate your Brainstorm account",
    );
    expect(screen.getByTestId("text-activate-brainstorm-subtitle")).toHaveTextContent(
      "Sign a note that tells other apps where to find your Brainstorm scores.",
    );
  });

  // ta_pubkey exists from login (the backend creates it while minting the
  // session token), so the button is always live — no waiting state.
  it("opens the signing flow on click", () => {
    const onActivate = vi.fn();
    renderWithProviders(<ActivateBrainstormPanel onActivate={onActivate} />);

    fireEvent.click(screen.getByTestId("button-activate-brainstorm"));

    expect(onActivate).toHaveBeenCalledTimes(1);
  });
});
