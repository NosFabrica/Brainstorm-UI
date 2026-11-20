/**
 * In the dialogs that remove an Account from this device: the Routstr money this device
 * holds for it (a paid invoice, a bought key, change), which the removal deletes for good
 * (`removalLosesPurchases`). Nothing when there is none.
 */
import { AlertTriangle } from "lucide-react";
import { accountsFor } from "@/accounts/login";
import type { BrainstormAccount } from "@/accounts/metadata";
import { heldMoney } from "@/lib/routstrPurchase";

/**
 * The Routstr money this device holds for `account` (lib/routstrPurchase `heldMoney`) that
 * removing it would delete (`removeAccountFromDevice` clears the identity's rows): none
 * while another Account of that identity keeps them.
 */
export function removalLosesPurchases(account: BrainstormAccount): string[] {
  if (accountsFor(account.pubkey).some((other) => other.id !== account.id)) return [];
  return heldMoney(account.pubkey);
}

export function HeldPurchasesWarning({ account }: { account: BrainstormAccount | null | undefined }) {
  const held = account ? removalLosesPurchases(account) : [];
  if (!held.length) return null;
  return (
    <p
      className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
      data-testid="remove-account-held-purchases"
    >
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        This device also holds {listed(held)} for this account. Removing it deletes that here for good: finish it first
        in Settings › Assistants › AI model.
      </span>
    </p>
  );
}

function listed(items: string[]): string {
  if (items.length < 2) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
