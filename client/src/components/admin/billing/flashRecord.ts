/**
 * Flash's own subscription record, read for an admin.
 *
 * The server hands the body over unmodified — `GET /admin/billing/subscriptions/
 * {pubkey}/flash` and its unresolved twin return `{ livemode, subscriptions:
 * [...] }` exactly as Flash sent it. So this module reads Flash's documented
 * shape (camelCase, amounts as strings in minor units, bare dates beside Z
 * instants) and turns it into facts an operator can act on: since when, how
 * many cycles, what they pay, how a failed renewal is going, how it ends.
 *
 * Tolerant by construction. Flash documents its statuses and fields as an open
 * set, and the staging account is on a newer product than the guide describes,
 * so every field is optional and an absent one is absent — never "—" or a
 * guess. Only what Flash actually said reaches the sheet.
 */

export interface FlashDunningPolicy {
  maxAttempts: number | null;
  retryIntervalDays: number | null;
  gracePeriodDays: number | null;
  cancelAfterFinalFailure: boolean | null;
}

export interface FlashCancellationPolicy {
  /** `end_of_period` on this account; Flash documents the set as open. */
  mode: string | null;
  minimumCommitmentPeriods: number | null;
  noticePeriodDays: number | null;
}

export interface FlashSubscriptionRecord {
  id: string | null;
  /** Our hex pubkey when the checkout carried one; null is a signup that named nobody. */
  ref: string | null;
  /** Verbatim. Unknown values must survive to be seen. */
  status: string;
  planName: string | null;
  amountMinor: number | null;
  currency: string | null;
  billingInterval: string | null;
  trialDays: number | null;
  setupFeeMinor: number | null;
  createdAt: string | null;
  /** 1 on the first paid period, incremented by each renewal. */
  currentPeriodNumber: number | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextBillingDate: string | null;
  trialEndDate: string | null;
  dunningAttempts: number | null;
  firstFailedAt: string | null;
  canceledAt: string | null;
  cancelReason: string | null;
  cancelEffectiveDate: string | null;
  portalUrl: string | null;
  dunning: FlashDunningPolicy | null;
  cancellation: FlashCancellationPolicy | null;
}

type Bag = Record<string, unknown>;

function bag(v: unknown): Bag | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Bag) : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/** Flash sends amounts as strings ("200" = $2.00) and counts as numbers; both read. */
function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

export function readFlashSubscription(raw: unknown): FlashSubscriptionRecord {
  const r = bag(raw) ?? {};
  const pricing = bag(r.pricingSnapshot);
  const dunning = bag(r.dunningPolicy);
  const cancellation = bag(r.cancellationPolicy);
  return {
    id: str(r.id),
    ref: str(r.ref),
    status: str(r.status) ?? "unknown",
    planName: pricing ? str(pricing.planName) : null,
    amountMinor: pricing ? num(pricing.amount) : null,
    currency: pricing ? str(pricing.currency) : null,
    billingInterval: pricing ? str(pricing.billingInterval) : null,
    trialDays: pricing ? num(pricing.trialDays) : null,
    setupFeeMinor: pricing ? num(pricing.setupFee) : null,
    createdAt: str(r.createdAt),
    currentPeriodNumber: num(r.currentPeriodNumber),
    currentPeriodStart: str(r.currentPeriodStart),
    currentPeriodEnd: str(r.currentPeriodEnd),
    nextBillingDate: str(r.nextBillingDate),
    trialEndDate: str(r.trialEndDate),
    dunningAttempts: num(r.dunningAttempts),
    firstFailedAt: str(r.firstFailedAt),
    canceledAt: str(r.canceledAt),
    cancelReason: str(r.cancelReason),
    cancelEffectiveDate: str(r.cancelEffectiveDate),
    portalUrl: str(r.portalUrl),
    dunning: dunning
      ? {
          maxAttempts: num(dunning.maxAttempts),
          retryIntervalDays: num(dunning.retryIntervalDays),
          gracePeriodDays: num(dunning.gracePeriodDays),
          cancelAfterFinalFailure: bool(dunning.cancelAfterFinalFailure),
        }
      : null,
    cancellation: cancellation
      ? {
          mode: str(cancellation.mode),
          minimumCommitmentPeriods: num(cancellation.minimumCommitmentPeriods),
          noticePeriodDays: num(cancellation.noticePeriodDays),
        }
      : null,
  };
}

function periods(n: number): string {
  return `${n} ${n === 1 ? "period" : "periods"}`;
}

/**
 * How many billing cycles, in words — derived only from what Flash's status
 * vocabulary guarantees. `active` is "paid and current", so its period number
 * is the count of cycles they have been billed for. `past_due` means the
 * current period's renewal failed, so that one is unpaid. `trial` has billed
 * nothing yet. Every other status just says how many periods there were.
 *
 * Renewals actually *received* — with amounts and dates — are on the webhook
 * payloads the server stores and does not yet expose; see the asks doc.
 */
export function describeCycles(r: FlashSubscriptionRecord): string | null {
  if (r.status === "trial") return "In trial, nothing billed yet";
  const n = r.currentPeriodNumber;
  if (n === null) return null;
  if (r.status === "active") return `${periods(n)} billed`;
  if (r.status === "past_due") return `Period ${n}, renewal unpaid`;
  return periods(n);
}

/** "Attempt 2 of 3" — only while a renewal is actually failing. */
export function describeDunning(r: FlashSubscriptionRecord): string | null {
  const attempts = r.dunningAttempts ?? 0;
  if (r.status !== "past_due" && attempts <= 0) return null;
  const max = r.dunning?.maxAttempts;
  if (attempts > 0) return max ? `Attempt ${attempts} of ${max}` : `${attempts} ${attempts === 1 ? "attempt" : "attempts"} so far`;
  return "Renewal failed, Flash is retrying";
}

function days(n: number): string {
  return `${n} ${n === 1 ? "day" : "days"}`;
}

/**
 * The account's policies as one or two plain sentences, so an operator reading
 * "past due" knows what Flash does next without opening Flash. Nothing is
 * invented: a sentence appears only when its policy came with the record.
 */
export function describePolicy(r: FlashSubscriptionRecord): string | null {
  const out: string[] = [];
  const d = r.dunning;
  if (d && d.maxAttempts !== null) {
    let s = `Flash retries a failed renewal up to ${d.maxAttempts} ${d.maxAttempts === 1 ? "time" : "times"}`;
    if (d.retryIntervalDays !== null) s += `, ${days(d.retryIntervalDays)} apart`;
    if (d.gracePeriodDays !== null) s += `, with a ${d.gracePeriodDays}-day grace period`;
    if (d.cancelAfterFinalFailure === true) s += ", then cancels.";
    else if (d.cancelAfterFinalFailure === false) s += ", then leaves it past due.";
    else s += ".";
    out.push(s);
  }
  const c = r.cancellation;
  if (c?.mode) {
    if (c.mode === "end_of_period") out.push("Cancellations take effect at the end of the paid period.");
    else if (c.mode === "immediate") out.push("Cancellations take effect immediately.");
    else out.push(`Cancellation policy: ${c.mode.replace(/_/g, " ")}.`);
  }
  return out.length ? out.join(" ") : null;
}
