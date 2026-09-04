import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { formatAmount, formatBillingDate, formatBillingInterval } from "@/lib/plans";
import { statusTone } from "./DivergenceRows";
import { describeCycles, readFlashSubscription } from "./flashRecord";

/** Shared with the record dialog, so a row that already asked Flash feeds the dialog. */
export const flashRecordKey = (id: string) => ["/api/admin/billing/flash-record", id] as const;

/**
 * Flash's facts about one signup, on the row itself: status, plan and price,
 * since when, how many cycles, and how it ends. Two short lines, right-aligned
 * beside the lead on a desk and wrapping under it on a phone.
 *
 * One Flash read per signup, cached for the tab's life — the same key the
 * record dialog uses, so opening it costs nothing more. Absent or unreachable,
 * the strip is simply not there: the row's lead and handle never depend on it.
 */
export function FlashFactsStrip({
  id,
  read,
  testId,
}: {
  id: string;
  read: (id: string) => Promise<unknown>;
  testId: string;
}) {
  const query = useQuery({
    queryKey: flashRecordKey(id),
    // react-query refuses `undefined` as data; a mocked or empty answer is null.
    queryFn: async () => (await read(id)) ?? null,
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (query.isPending) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500" aria-label="Asking Flash">
        <Loader2 className="h-3 w-3 animate-spin" />
      </span>
    );
  }
  const body = query.data as { subscriptions?: unknown[] } | null | undefined;
  const rows = Array.isArray(body?.subscriptions) ? body.subscriptions : [];
  if (query.isError || rows.length === 0) return null;

  const r = readFlashSubscription(rows[0]);
  const price = r.amountMinor !== null && r.currency ? formatAmount(r.amountMinor, r.currency) : null;
  const interval = formatBillingInterval(r.billingInterval);
  const plan = [r.planName, price ? `${price}${interval ? ` ${interval}` : ""}` : null].filter(Boolean).join(" · ");
  const cycles = describeCycles(r);
  const ending = r.cancelEffectiveDate
    ? `Ends ${formatBillingDate(r.cancelEffectiveDate)}`
    : r.canceledAt
      ? `Cancelled ${formatBillingDate(r.canceledAt)}`
      : r.nextBillingDate
        ? `Next bill ${formatBillingDate(r.nextBillingDate)}`
        : null;
  const line2 = [
    r.createdAt ? `Since ${formatBillingDate(r.createdAt)}` : null,
    cycles,
    ending,
    rows.length > 1 ? `+${rows.length - 1} more ${rows.length === 2 ? "row" : "rows"} in Flash` : null,
  ].filter(Boolean);

  return (
    <span
      className="flex min-w-0 flex-col items-start gap-0.5 text-xs leading-tight sm:items-end sm:text-right"
      data-testid={testId}
    >
      <span className="flex flex-wrap items-center gap-1.5 text-slate-700 dark:text-slate-200">
        <Chip tone={statusTone(r.status)} size="sm">
          {r.status}
        </Chip>
        {plan && <span className="font-medium">{plan}</span>}
      </span>
      {line2.length > 0 && (
        <span className="text-[11px] text-slate-500 dark:text-slate-400">{line2.join(" · ")}</span>
      )}
    </span>
  );
}
