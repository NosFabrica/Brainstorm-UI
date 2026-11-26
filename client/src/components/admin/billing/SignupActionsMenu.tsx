import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { FileJson, Ban, UserCheck } from "lucide-react";
import { RowActionsTrigger } from "./SubscriberRow";

export type SignupActions = {
  onViewFlashRecord: (subscriptionId: string) => void;
  onAttribute: (subscriptionId: string) => void;
  onDismiss: (subscriptionId: string) => void;
};

/** The three things an admin can do with a signup that named nobody — shared
 *  by the signup rows and the exhausted events that borrow their handle. */
export function SignupActionsMenu({
  id,
  busy,
  canDismiss = true,
  testIdPrefix,
  itemPrefix,
  onViewFlashRecord,
  onAttribute,
  onDismiss,
}: SignupActions & { id: string; busy: boolean; canDismiss?: boolean; testIdPrefix: string; itemPrefix: string }) {
  return (
    <DropdownMenu>
      <RowActionsTrigger label="Signup actions" busy={busy} testId={testIdPrefix} small />
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Actions
        </DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={() => onViewFlashRecord(id)}
          className="flex-col items-start gap-0.5"
          data-testid={`${itemPrefix}-flash-record`}
        >
          <span className="flex items-center">
            <FileJson className="mr-2 h-3.5 w-3.5" /> Flash's record
          </span>
          <span className="pl-[22px] text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            What state this signup is actually in — it may already be cancelled. Read-only; it changes nothing.
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={busy}
          onSelect={() => onAttribute(id)}
          className="flex-col items-start gap-0.5"
          data-testid={`${itemPrefix}-attribute`}
        >
          <span className="flex items-center">
            <UserCheck className="mr-2 h-3.5 w-3.5" /> Attribute to a person
          </span>
          <span className="pl-[22px] text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            Attaches this payment to an account and grants whatever its plan grants — the same way a webhook naming them
            would have.
          </span>
        </DropdownMenuItem>
        {canDismiss && (
          <DropdownMenuItem
            disabled={busy}
            onSelect={() => onDismiss(id)}
            className="flex-col items-start gap-0.5 text-red-600 dark:text-red-400"
            data-testid={`${itemPrefix}-dismiss`}
          >
            <span className="flex items-center">
              <Ban className="mr-2 h-3.5 w-3.5" /> Dismiss as nobody's
            </span>
            <span className="pl-[22px] text-[11px] leading-snug text-slate-500 dark:text-slate-400">
              Clears it from this report without granting anything. Doesn't cancel or refund — that stays in Flash,
              which took the money.
            </span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
