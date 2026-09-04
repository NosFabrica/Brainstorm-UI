import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FlashSubscriptionSheet } from "./FlashRecordDialog";

// The shape Flash's integration guide documents for every subscription
// endpoint — amounts as strings in minor units, dates as bare days, instants
// with a Z. The sheet reads it as it arrives; nothing is normalised upstream.
const ACTIVE = {
  id: "7d3b",
  ref: "a".repeat(64),
  status: "active",
  pricingSnapshot: {
    planName: "Priority",
    amount: "200",
    currency: "USD",
    billingInterval: "monthly",
    trialDays: 0,
    setupFee: null,
  },
  dunningPolicy: { maxAttempts: 3, retryIntervalDays: 3, gracePeriodDays: 7, cancelAfterFinalFailure: true },
  cancellationPolicy: { mode: "end_of_period", minimumCommitmentPeriods: 0, noticePeriodDays: 0 },
  currentPeriodStart: "2026-08-20",
  currentPeriodEnd: "2026-09-20",
  currentPeriodNumber: 3,
  nextBillingDate: "2026-09-20",
  anchorDate: "2026-06-20",
  trialEndDate: null,
  dunningAttempts: 0,
  firstFailedAt: null,
  canceledAt: null,
  cancelReason: null,
  cancelEffectiveDate: null,
  portalUrl: "https://dev.server.vault.paywithflash.com/subscriptions/portal/svc",
  createdAt: "2026-06-20T10:00:00.000Z",
  updatedAt: "2026-08-20T10:00:00.000Z",
};

describe("FlashSubscriptionSheet", () => {
  it("reads tenure, billing cycles and price off Flash's own record", () => {
    render(<FlashSubscriptionSheet raw={ACTIVE} />);

    // Subscribed since the day Flash created it — their tenure.
    expect(screen.getByTestId("flash-sheet-since").textContent).toContain("Jun 20, 2026");
    // Active means paid and current, so the period number is how many cycles
    // they have been billed for.
    expect(screen.getByTestId("flash-sheet-cycles").textContent).toContain("3 periods billed");
    // Plan and price as Flash snapshotted them, in words not minor units.
    const plan = screen.getByTestId("flash-sheet-plan").textContent ?? "";
    expect(plan).toContain("Priority");
    expect(plan).toContain("$2.00");
    expect(plan).toContain("per month");
    // The dates admins ask about, on the same sheet.
    expect(screen.getByTestId("flash-sheet-period").textContent).toMatch(/Aug 20, 2026.*Sep 20, 2026/);
    expect(screen.getByTestId("flash-sheet-next-bill").textContent).toContain("Sep 20, 2026");
    expect(screen.getByTestId("flash-sheet-status").textContent).toContain("active");
    // The ref is our pubkey; it reads as the npub the roster shows, never raw hex.
    expect(screen.getByTestId("flash-sheet-ref").textContent).toMatch(/npub1/);
    expect(screen.getByTestId("flash-sheet-ref").textContent).not.toContain("a".repeat(64));
    // Nothing failed, nothing cancelled: those blocks stay off the sheet.
    expect(screen.queryByTestId("flash-sheet-dunning")).toBeNull();
    expect(screen.queryByTestId("flash-sheet-cancellation")).toBeNull();
  });
});

describe("FlashSubscriptionSheet — how it is going wrong, and how it ends", () => {
  it("shows a failing renewal as attempts against Flash's policy, and the period as unpaid", () => {
    render(
      <FlashSubscriptionSheet
        raw={{
          ...ACTIVE,
          status: "past_due",
          dunningAttempts: 2,
          firstFailedAt: "2026-09-01T15:00:00.000Z",
        }}
      />,
    );
    const dunning = screen.getByTestId("flash-sheet-dunning").textContent ?? "";
    expect(dunning).toContain("Attempt 2 of 3");
    expect(dunning).toContain("Sep 1, 2026");
    expect(screen.getByTestId("flash-sheet-cycles").textContent).toContain("Period 3, renewal unpaid");
    // What Flash does next, in words, so nobody has to open Flash to know.
    const policy = screen.getByTestId("flash-sheet-policy").textContent ?? "";
    expect(policy).toContain("up to 3 times");
    expect(policy).toContain("3 days apart");
    expect(policy).toContain("7-day grace");
    expect(policy).toContain("then cancels");
    expect(policy).toContain("end of the paid period");
  });

  it("shows a cancellation with its date, end and reason, and drops the next bill", () => {
    render(
      <FlashSubscriptionSheet
        raw={{
          ...ACTIVE,
          canceledAt: "2026-08-31T15:06:09.067Z",
          cancelReason: "too expensive",
          cancelEffectiveDate: "2026-09-20",
        }}
      />,
    );
    const c = screen.getByTestId("flash-sheet-cancellation").textContent ?? "";
    expect(c).toContain("Cancelled");
    expect(c).toContain("Aug 31, 2026");
    expect(c).toContain("ends Sep 20, 2026");
    expect(c).toContain("too expensive");
    // Under end-of-period cancellation Flash still reports a next billing date;
    // showing it beside "ends Sep 20" would promise a charge that never comes.
    expect(screen.queryByTestId("flash-sheet-next-bill")).toBeNull();
  });

  it("reads a trial as nothing billed yet, with the day it ends", () => {
    render(
      <FlashSubscriptionSheet
        raw={{ ...ACTIVE, status: "trial", currentPeriodNumber: 1, trialEndDate: "2026-09-03" }}
      />,
    );
    expect(screen.getByTestId("flash-sheet-cycles").textContent).toContain("In trial, nothing billed yet");
    expect(screen.getByTestId("flash-sheet-trial").textContent).toContain("Sep 3, 2026");
  });

  it("puts only what Flash sent on the sheet — a bare row is a status and an account, not a wall of dashes", () => {
    render(<FlashSubscriptionSheet raw={{ id: "old", status: "some_future_status", ref: null }} />);
    expect(screen.getByTestId("flash-sheet-status").textContent).toContain("some_future_status");
    expect(screen.getByTestId("flash-sheet-ref").textContent).toContain("Named no account");
    for (const id of ["flash-sheet-since", "flash-sheet-cycles", "flash-sheet-period", "flash-sheet-next-bill", "flash-sheet-plan", "flash-sheet-policy", "flash-sheet-portal"]) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    expect(screen.getByTestId("flash-sheet").textContent).not.toContain("—");
  });
});
