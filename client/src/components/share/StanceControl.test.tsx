import { describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StanceButtons, stanceMenuRow } from "./StanceControl";

/**
 * Issue #41 B2 — the stance control.
 *
 * Two defects, and the tests below are named for the user-visible consequence
 * rather than the code shape, because the code shape (`agreed ? -1 : 1`) is
 * exactly what will look reasonable to whoever is tempted to reintroduce it:
 *
 * 1. From neutral, only "Agree" was reachable. `/tags/mine` — the page for
 *    answering what people say about you — offered a lone Agree button under a
 *    header reading "Something here that's wrong? Disagree with it."
 * 2. Pressing an active toggle published the OPPOSITE claim. People read that
 *    as undo. There is no undo: `buildProfileTagAssertion` takes polarity 1 or
 *    -1 and throws on anything else, and nothing deletes. So the press that
 *    looked like "never mind" was a permanent, signed, public disagreement.
 */

const cases = [
  { name: "no vote yet", stance: undefined },
  { name: "already agreed", stance: "apply" as const },
  { name: "already disagreed", stance: "dispute" as const },
];

describe("StanceButtons", () => {
  it("offers disagree from neutral, without agreeing first", async () => {
    const onVote = vi.fn();
    render(<StanceButtons stance={undefined} onVote={onVote} />);
    await userEvent.click(screen.getByTestId("tag-vote-disagree"));
    expect(onVote).toHaveBeenCalledWith(-1);
    expect(onVote).toHaveBeenCalledTimes(1);
  });

  it("offers agree from neutral", async () => {
    const onVote = vi.fn();
    render(<StanceButtons stance={undefined} onVote={onVote} />);
    await userEvent.click(screen.getByTestId("tag-vote-agree"));
    expect(onVote).toHaveBeenCalledWith(1);
  });

  it("never publishes the opposite of what was pressed", async () => {
    // The heart of defect 2, stated as the invariant that was violated:
    // whatever the current stance, the Agree button can ONLY ever emit +1 and
    // the Disagree button can ONLY ever emit -1. Under `agreed ? -1 : 1` the
    // Agree button emitted -1 whenever you already agreed, which is how people
    // published disagreements they never chose.
    for (const c of cases) {
      for (const [testId, allowed] of [
        ["tag-vote-agree", 1],
        ["tag-vote-disagree", -1],
      ] as const) {
        const onVote = vi.fn();
        render(<StanceButtons stance={c.stance} onVote={onVote} />);
        await userEvent.click(screen.getByTestId(testId));
        for (const [polarity] of onVote.mock.calls) {
          expect(polarity, `${testId} with stance "${c.stance ?? "none"}"`).toBe(allowed);
        }
        cleanup();
      }
    }
  });

  it("does nothing when you press the stance you already hold", async () => {
    // Previously this published a reversal. "Press again" is not consent to
    // saying the opposite thing about someone in public.
    const agreedVote = vi.fn();
    render(<StanceButtons stance="apply" onVote={agreedVote} />);
    await userEvent.click(screen.getByTestId("tag-vote-agree"));
    expect(agreedVote).not.toHaveBeenCalled();
    cleanup();

    const disagreedVote = vi.fn();
    render(<StanceButtons stance="dispute" onVote={disagreedVote} />);
    await userEvent.click(screen.getByTestId("tag-vote-disagree"));
    expect(disagreedVote).not.toHaveBeenCalled();
  });

  it("still lets you change your mind", async () => {
    // Not an undo — a replacement. The protocol stores one assertion per
    // (tag, target, asserter), so this overwrites rather than retracts.
    const onVote = vi.fn();
    render(<StanceButtons stance="apply" onVote={onVote} />);
    await userEvent.click(screen.getByTestId("tag-vote-disagree"));
    expect(onVote).toHaveBeenCalledWith(-1);
  });

  it("shows which stance you hold", () => {
    render(<StanceButtons stance="apply" onVote={vi.fn()} />);
    expect(screen.getByTestId("tag-vote-agree")).toHaveAttribute("data-agreed", "true");
    expect(screen.getByTestId("tag-vote-disagree")).toHaveAttribute("data-disagreed", "false");
  });

  it("offers no way to withdraw, in any label", () => {
    // The old tooltip read "You agree — tap to withdraw", promising something
    // the protocol cannot do.
    for (const c of cases) {
      render(<StanceButtons stance={c.stance} onVote={vi.fn()} />);
      const labels = screen
        .getAllByRole("button")
        .flatMap((b) => [b.getAttribute("title"), b.getAttribute("aria-label"), b.textContent]);
      for (const label of labels) {
        expect(label ?? "").not.toMatch(/withdraw|undo|take .* back|remove/i);
      }
      cleanup();
    }
  });
});

describe("stanceMenuRow", () => {
  it("gives menus both choices, with the held one inert", () => {
    const neutral = stanceMenuRow(undefined);
    expect(neutral.agree.polarity).toBe(1);
    expect(neutral.disagree.polarity).toBe(-1);
    expect(neutral.agree.disabled).toBe(false);
    expect(neutral.disagree.disabled).toBe(false);

    const agreed = stanceMenuRow("apply");
    expect(agreed.agree.disabled).toBe(true);
    expect(agreed.disagree.disabled).toBe(false);
    expect(agreed.disagree.polarity).toBe(-1);

    const disagreed = stanceMenuRow("dispute");
    expect(disagreed.disagree.disabled).toBe(true);
    expect(disagreed.agree.disabled).toBe(false);
    expect(disagreed.agree.polarity).toBe(1);
  });
});
