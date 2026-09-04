/**
 * The server speaks in webhook event names and failure codes; admins don't.
 * These translate Flash's `subscription.*` events and the server's
 * EntitlementReason codes into the admin's words, with a readable fallback
 * for anything either side adds later.
 */
import type { Tone } from "@/lib/tones";

const EVENT_LABELS: Record<string, string> = {
  "subscription.activated": "Subscription started",
  "subscription.created": "Subscription created",
  "subscription.renewed": "Subscription renewed",
  "subscription.canceled": "Subscription cancelled",
  "subscription.cancelled": "Subscription cancelled",
  "subscription.expired": "Subscription expired",
  "subscription.paused": "Subscription paused",
  "subscription.resumed": "Subscription resumed",
  "subscription.past_due": "Payment overdue",
  "subscription.payment_failed": "Payment failed",
  "subscription.updated": "Subscription updated",
};

const EVENT_TONES: Record<string, Tone> = {
  "subscription.activated": "success",
  "subscription.created": "success",
  "subscription.renewed": "success",
  "subscription.resumed": "success",
  "subscription.past_due": "warning",
  "subscription.payment_failed": "warning",
  "subscription.paused": "warning",
};

/** "subscription.trial_will_end" → "Subscription trial will end". */
function humanize(code: string): string {
  const words = code.replace(/[._-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
}

export function eventLabel(event: string | null | undefined): string {
  if (!event) return "Event";
  return EVENT_LABELS[event] ?? humanize(event);
}

export function eventTone(event: string | null | undefined): Tone {
  return (event && EVENT_TONES[event]) || "neutral";
}

const FAILURE_LABELS: Record<string, string> = {
  no_reference: "Named no account",
  unknown_user: "No account matches",
  unknown_plan: "Plan not mapped",
  unknown_subscription: "Flash has no such subscription",
  reference_mismatch: "Names a different account",
  blocked: "Account blocked from billing",
  busy: "Another sync was running",
  reread_failed: "Applied, but the re-read failed",
};

export function failureLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return FAILURE_LABELS[code] ?? humanize(code);
}
