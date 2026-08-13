/**
 * The account list, as a second face of the account panel rather than a list
 * growing inside it. The identity card at the top of the panel swaps to this;
 * "Back" swaps it away again, so the panel's height never depends on how many
 * Accounts a device holds — which is what a 360px popover and a bottom sheet on a
 * short phone both need.
 *
 * Rows read exactly as the login picker's do, and for one reason that isn't
 * cosmetic: `BackupReminder` only ever nags about the Active Account, so this pane
 * is the only place anyone learns that a *second* Account has no backup.
 *
 * Removal hides behind "Manage". It destroys a key, and in a list whose whole
 * purpose is tapping rows it must never be one mis-tap away — so the pane changes
 * mode instead, and the rows stop being a way to switch while it is on.
 */
import { useState } from "react";
import { useActiveAccount } from "applesauce-react/hooks";
import { ArrowLeft, Check, Loader2, Plus, Trash2 } from "lucide-react";

import { isUnlockCancelled } from "@/accounts/local-signer";
import type { BrainstormAccount } from "@/accounts/metadata";
import { withActiveAccount, type PickerIdentity, type PickerRow } from "@/accounts/picker";
import { AccountFace, AccountNames, AccountRowChips } from "@/components/AccountRow";
import { useToast } from "@/hooks/use-toast";
import { useLoginPicker } from "@/hooks/useLoginPicker";
import { signInWithAccount } from "@/accounts/login-flow";
import { cn } from "@/lib/utils";

export type AccountSwitcherProps = Omit<AccountSwitcherPaneProps, "identities" | "activeId">;

/**
 * The pane, over the Accounts this device actually holds. Rendered only once the
 * pane is open, so the login picker's two probes — one extension wait, one Unlock
 * cache decrypt per local key — don't run behind every panel that mounts.
 */
export function AccountSwitcher(props: AccountSwitcherProps) {
  const { identities } = useLoginPicker();
  const account = useActiveAccount() as BrainstormAccount | undefined;
  return (
    <AccountSwitcherPane
      identities={withActiveAccount(identities, account)}
      activeId={account?.id}
      {...props}
    />
  );
}

export type AccountSwitcherPaneProps = {
  identities: PickerIdentity[];
  /** Which row is the one signing — it is shown, not offered. */
  activeId?: string;
  /** Leave the pane, back to the panel proper. */
  onBack: () => void;
  /** Switched to another Account: the host closes the panel. */
  onSwitched: () => void;
  /**
   * Let this Account go. The host closes the panel and puts up the warning, and
   * needs to know whether this is the Account signing: what it can offer instead
   * of removal — backing the key up first — only works for that one.
   */
  onRequestRemove: (account: BrainstormAccount, isActive: boolean) => void;
  /** Sign in as somebody this device doesn't hold yet. */
  onAddAccount: () => void;
};

export function AccountSwitcherPane({
  identities,
  activeId,
  onBack,
  onSwitched,
  onRequestRemove,
  onAddAccount,
}: AccountSwitcherPaneProps) {
  const { toast } = useToast();
  const [managing, setManaging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const switchTo = async (row: PickerRow) => {
    if (busy) return;
    setBusy(row.account.id);
    try {
      await signInWithAccount(row.account);
      onSwitched();
    } catch (error) {
      // A declined unlock is an answer, not a failure — say nothing about it.
      if (!isUnlockCancelled(error)) {
        toast({
          variant: "destructive",
          title: "Couldn't switch accounts",
          description: error instanceof Error ? error.message : "Please try again.",
        });
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="relative" data-testid="account-switcher">
      <div className="flex items-center gap-1 p-2 pb-1">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200 transition-colors hover:bg-white/70 dark:hover:bg-white/[0.08] outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
          data-testid="switcher-back"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" /> Your accounts
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setManaging((on) => !on)}
          aria-pressed={managing}
          className={cn(
            "rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40",
            managing
              ? "bg-white/70 text-brand-deep dark:bg-white/[0.12] dark:text-brand-link"
              : "text-slate-500 hover:bg-white/70 dark:text-slate-400 dark:hover:bg-white/[0.08]",
          )}
          data-testid="switcher-manage"
        >
          {managing ? "Done" : "Manage"}
        </button>
      </div>

      {managing && (
        <p
          className="px-4 pb-1.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400"
          data-testid="switcher-manage-note"
        >
          Removing an account deletes its key from this browser.
        </p>
      )}

      {/* The height cap, not the pane swap, is what bounds a device holding ten
          identities — the swap is what keeps the panel's *other* face out of it. */}
      <div className="max-h-[280px] overflow-y-auto px-1.5 pb-1.5">
        {identities.map((identity) => (
          <div key={identity.pubkey} className="py-0.5">
            {identity.rows.length > 1 && (
              <div className="flex items-center gap-2.5 px-2.5 pt-1.5 pb-1">
                <AccountFace identity={identity} className="h-7 w-7" />
                <AccountNames identity={identity} />
              </div>
            )}
            {identity.rows.map((row) => (
              <Row
                key={row.account.id}
                identity={identity}
                row={row}
                grouped={identity.rows.length > 1}
                active={row.account.id === activeId}
                managing={managing}
                busy={busy === row.account.id}
                disabled={busy !== null}
                onSwitch={() => void switchTo(row)}
                onRemove={() => onRequestRemove(row.account, row.account.id === activeId)}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="px-1.5 pb-1.5">
        <button
          type="button"
          onClick={onAddAccount}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors hover:bg-white/70 dark:hover:bg-white/[0.08] outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
          data-testid="switcher-add-account"
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span>Add another account</span>
        </button>
      </div>
    </div>
  );
}

type RowProps = {
  identity: PickerIdentity;
  row: PickerRow;
  /** Under an identity heading, so the face and names are already on screen. */
  grouped: boolean;
  active: boolean;
  managing: boolean;
  busy: boolean;
  disabled: boolean;
  onSwitch: () => void;
  onRemove: () => void;
};

function Row({ identity, row, grouped, active, managing, busy, disabled, onSwitch, onRemove }: RowProps) {
  const body = (
    <>
      {!grouped && <AccountFace identity={identity} className="h-9 w-9" />}
      {!grouped && <AccountNames identity={identity} />}
      <span className={cn("flex items-center gap-1", grouped && "flex-1")}>
        <AccountRowChips row={row} />
      </span>
    </>
  );

  const padding = grouped ? "px-2.5 py-1.5" : "px-2.5 py-2";

  // Managing, the Active Account, and a Signer that can't sign here are all rows
  // that stay listed without being a way in — the difference is only what sits at
  // the end of them.
  if (managing || active || !row.selectable) {
    return (
      <div className={cn("flex items-center gap-2.5 rounded-lg", padding)}>
        {body}
        {managing ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${identity.name || identity.npub} from this device`}
            className="shrink-0 rounded-lg p-1.5 text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/15 outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
            data-testid={`switcher-remove-${row.account.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : active ? (
          <Check
            className="h-4 w-4 shrink-0 text-brand-primary dark:text-brand-link"
            data-testid={`switcher-active-${row.account.id}`}
          />
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSwitch}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg text-left transition-colors hover:bg-white/70 dark:hover:bg-white/[0.08] disabled:opacity-60 outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40",
        padding,
      )}
      data-testid={`switcher-pick-${row.account.id}`}
    >
      {body}
      {busy && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
    </button>
  );
}
