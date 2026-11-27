import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { User } from "lucide-react";
import React from "react";
import { type ProfileBits, shortNpub } from "./rosterShared";

/**
 * Confirm a consequential write, naming who it lands on — the same shape
 * `UserTierPicker` uses on the Users tab: avatar, the profile name when kind-0
 * gave us one, and the npub otherwise. Never the raw hex, which nobody can
 * recognize and everybody can mistype.
 *
 * A signup that named nobody has no person to name, so it falls back to the
 * Flash subscription id — the only handle such a row has.
 *
 * The gate is that the action lives only on the confirm button: opening the
 * dialog does nothing at all.
 */
export type ConfirmSubject = {
  /** Who it lands on, when there is somebody. */
  pubkey?: string | null;
  /** Stands in for a person when there is none. */
  handle?: string;
  profile?: ProfileBits;
};

export function ConfirmSubscriptionAction({
  subject,
  kind,
  title,
  confirmLabel,
  confirmDisabled = false,
  destructive = true,
  dismissLabel = "Keep it",
  onDismiss,
  onConfirm,
  children,
}: {
  /** Null closes the dialog — there is nothing to confirm without a subject. */
  subject: ConfirmSubject | null;
  kind: "cancel" | "pause" | "resume" | "attribute" | "dismiss" | "reset";
  title: string;
  confirmLabel: string;
  confirmDisabled?: boolean;
  destructive?: boolean;
  dismissLabel?: string;
  onDismiss: () => void;
  onConfirm: () => void | Promise<void>;
  children: React.ReactNode;
}) {
  const profile = subject?.profile;
  const who = subject?.pubkey ? shortNpub(subject.pubkey) : null;
  const name = profile?.name || who?.short;
  return (
    <Dialog open={!!subject} onOpenChange={(o) => !o && onDismiss()}>
      <DialogContent className="sm:max-w-md" data-testid={`dialog-billing-${kind}-confirm`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div>
              <span className="mb-2 flex items-center gap-2" data-testid={`billing-${kind}-confirm-who`}>
                {who ? (
                  <>
                    <Avatar className="h-7 w-7 shrink-0">
                      {profile?.picture ? (
                        <AvatarImage src={profile.picture} alt={name || "Subscriber"} className="object-cover" />
                      ) : null}
                      <AvatarFallback className="border border-slate-200 bg-slate-100 text-[10px] text-slate-400 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-500">
                        {profile?.name?.charAt(0)?.toUpperCase() || (
                          <User className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{name}</span>
                  </>
                ) : (
                  <span className="break-all font-mono text-xs text-slate-900 dark:text-slate-100">
                    {subject?.handle}
                  </span>
                )}
              </span>
              {children}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onDismiss} data-testid={`button-billing-${kind}-dismiss`}>
            {dismissLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "primary"}
            disabled={confirmDisabled}
            onClick={() => void onConfirm()}
            data-testid={`button-billing-${kind}-confirm`}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
