/**
 * The accounts this device kept, offered before the sign-in options rather than
 * instead of them: a returning user picks a face, and everything else on the page
 * becomes "add another".
 *
 * Rows carry the Signer and its health, and nothing about Sessions — picking a
 * row ensures one anyway. A row that can't sign here keeps its place and says so:
 * the npub on a dead row is the last trace of what was lost, and the thing its
 * owner needs in order to go looking.
 */
import { useState } from "react";
import { KeyRound, Loader2, RefreshCw } from "lucide-react";

import { isUnlockCancelled } from "@/accounts/local-signer";
import type { BrainstormAccount } from "@/accounts/metadata";
import type { PickerIdentity, PickerRow } from "@/accounts/picker";
import { AccountFace, AccountNames, AccountRowChips } from "@/components/AccountRow";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { removeAccountFromDevice, signInWithAccount } from "@/accounts/login-flow";
import { cn } from "@/lib/utils";

/** What a row that can't sign here offers instead. Removal is never the first thing. */
function DeadEnd({
  row,
  explain,
  onUseKey,
  onRecheckExtension,
  onForget,
}: {
  row: PickerRow;
  explain: boolean;
  onUseKey: () => void;
  onRecheckExtension: () => void;
  onForget: (account: BrainstormAccount) => void;
}) {
  const gone = row.health === "key-unavailable";
  const elsewhere = row.health === "signer-unusable";
  return (
    <div className="flex flex-col gap-2">
      {explain && (
        <p
          className="text-[13px] leading-snug text-muted-foreground"
          data-testid={gone ? `text-key-unavailable-${row.account.id}` : undefined}
        >
          {gone
            ? "This browser no longer holds this key, and no backup stands behind it. Sign in with your key if you kept one elsewhere."
            : elsewhere
              ? "This browser can't hand requests to Amber. It needs an Android browser over https, with “Desktop site” off — turn that back and reload. Nothing is lost."
              : "Your signing extension isn't available in this browser. Nothing is lost — enable it and look again, or add this account another way below."}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {gone && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onUseKey}
            data-testid={`button-use-key-${row.account.id}`}
          >
            <KeyRound /> Sign in with your key
          </Button>
        )}
        {!gone && !elsewhere && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRecheckExtension}
            data-testid={`button-recheck-extension-${row.account.id}`}
          >
            <RefreshCw /> Check again
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => onForget(row.account)}
          data-testid={`button-forget-account-${row.account.id}`}
        >
          Remove from this device
        </Button>
      </div>
    </div>
  );
}

export type LoginPickerProps = {
  identities: PickerIdentity[];
  /** Signed in as a picked Account — the page decides where that goes. */
  onSignedIn: () => void;
  /** "Sign in with your key", for an identity this device can no longer open. */
  onUseKey: () => void;
  /** Look for the extension again; it may have been enabled since the page loaded. */
  onRecheckExtension: () => void;
};

export function LoginPicker({
  identities,
  onSignedIn,
  onUseKey,
  onRecheckExtension,
}: LoginPickerProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [forgetting, setForgetting] = useState<BrainstormAccount | null>(null);

  // One explanation for a browser that lost every envelope at once — an eviction
  // that takes IndexedDB and spares localStorage kills them all together, and N
  // identical dead rows want one answer between them.
  const unavailable = identities.flatMap((identity) =>
    identity.rows.filter((row) => row.health === "key-unavailable"),
  ).length;

  const select = async (row: PickerRow) => {
    setBusy(row.account.id);
    try {
      await signInWithAccount(row.account);
      onSignedIn();
    } catch (error) {
      // A declined unlock is an answer, not a failure — say nothing about it.
      if (!isUnlockCancelled(error)) {
        toast({
          variant: "destructive",
          title: "Couldn't sign in",
          description: error instanceof Error ? error.message : "Please try again.",
        });
      }
    } finally {
      setBusy(null);
    }
  };

  if (identities.length === 0) {
    return (
      <Card
        className="border-dashed p-4 text-center text-sm text-muted-foreground"
        data-testid="login-picker-empty"
      >
        No accounts are saved on this device yet.
      </Card>
    );
  }

  const pickButton = (identity: PickerIdentity, row: PickerRow, grouped: boolean) => (
    <button
      key={row.account.id}
      type="button"
      onClick={() => void select(row)}
      disabled={busy !== null}
      className={cn(
        "w-full flex items-center gap-3 text-left transition-colors disabled:opacity-60",
        grouped ? "px-3 py-2 hover:bg-muted" : "px-3 py-2.5",
      )}
      data-testid={`button-pick-account-${row.account.id}`}
    >
      {!grouped && <AccountFace identity={identity} />}
      {!grouped && <AccountNames identity={identity} />}
      <span className={cn("flex items-center gap-1.5", grouped ? "flex-1" : "flex-col items-end shrink-0")}>
        <AccountRowChips row={row} />
      </span>
      {busy === row.account.id ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        grouped && <span className="text-xs font-semibold text-brand-link shrink-0">Use</span>
      )}
    </button>
  );

  return (
    <div className="space-y-2.5" data-testid="login-picker">
      {unavailable > 1 && (
        <p
          className="text-[13px] leading-snug text-muted-foreground"
          data-testid="notice-keys-unavailable"
        >
          This browser no longer holds the keys for the accounts marked below — they were kept
          here and nowhere else. Sign in with a key you kept elsewhere, or remove them; the npubs
          are the last trace of what was lost.
        </p>
      )}

      {identities.map((identity) => {
        const single = identity.rows.length === 1;
        return (
          <Card key={identity.pubkey} className="overflow-hidden" interactive={single && identity.rows[0].selectable}>
            {single ? (
              identity.rows[0].selectable ? (
                pickButton(identity, identity.rows[0], false)
              ) : (
                <div className="flex flex-col gap-2.5 px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <AccountFace identity={identity} />
                    <AccountNames identity={identity} />
                    <span className="flex flex-col items-end gap-1 shrink-0">
                      <AccountRowChips row={identity.rows[0]} />
                    </span>
                  </div>
                  <DeadEnd
                    row={identity.rows[0]}
                    explain={identity.rows[0].health !== "key-unavailable" || unavailable === 1}
                    onUseKey={onUseKey}
                    onRecheckExtension={onRecheckExtension}
                    onForget={setForgetting}
                  />
                </div>
              )
            ) : (
              <>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <AccountFace identity={identity} className="h-9 w-9" />
                  <AccountNames identity={identity} />
                </div>
                <div className="divide-y divide-border border-t border-border">
                  {identity.rows.map((row) =>
                    row.selectable ? (
                      pickButton(identity, row, true)
                    ) : (
                      <div key={row.account.id} className="flex flex-col gap-2 px-3 py-2.5">
                        <span className="flex items-center gap-1.5">
                          <AccountRowChips row={row} />
                        </span>
                        <DeadEnd
                          row={row}
                          explain={row.health !== "key-unavailable" || unavailable === 1}
                          onUseKey={onUseKey}
                          onRecheckExtension={onRecheckExtension}
                          onForget={setForgetting}
                        />
                      </div>
                    ),
                  )}
                </div>
              </>
            )}
          </Card>
        );
      })}

      <AlertDialog open={forgetting !== null} onOpenChange={(open) => !open && setForgetting(null)}>
        <AlertDialogContent data-testid="forget-account-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this account from this device?</AlertDialogTitle>
            <AlertDialogDescription>
              Everything this browser holds for it goes, including its npub. Anyone holding the
              key elsewhere can add it again; nobody else can.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                // Not `forgetAccount`: `/login?add=1` is reachable while signed in, so
                // this row may be the Active Account, and its Session has to go too.
                if (forgetting) removeAccountFromDevice(forgetting);
                setForgetting(null);
              }}
              data-testid="button-forget-account-confirm"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
