import type { Delivery } from "./store";

/** Our own placeholders for "the relay said nothing" — not worth repeating under the label. */
const SILENT = /^(timeout|timed out|could not connect)$/i;

/**
 * How one relay's answer reads: a short label, and the relay's own words (its
 * OK message, or a NOTICE it sent instead) so a refusal can be told apart from
 * a full inbox, a paywall or a policy.
 */
export function deliveryOutcome(d: Delivery): { label: string; detail?: string } {
  if (d.ok) return { label: "Accepted" };
  const said = d.message?.trim() && !SILENT.test(d.message.trim()) ? d.message.trim() : undefined;
  const notice = d.notice?.trim() && d.notice.trim() !== said ? `NOTICE: ${d.notice.trim()}` : undefined;
  const detail = [said, notice].filter(Boolean).join(" · ") || undefined;
  if (d.auth) return { label: "Needs sign-in", detail };
  if (d.unreachable) return { label: "Couldn't connect", detail };
  if (!said) return { label: "No answer", detail };
  return { label: "Refused", detail };
}
