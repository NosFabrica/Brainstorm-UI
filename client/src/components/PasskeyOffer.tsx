/**
 * "Skip the password next time?" — offered once, right after an Account was
 * opened by typing its Recovery password: the one moment the password has just
 * cost something, and the key is already open, so adding a passkey takes only
 * the system sheet.
 *
 * Never for someone who pasted an nsec (no prompt ran), never twice ("Not now"
 * is remembered on the Account), and never where the browser can't make one.
 */
import { useEffect, useState } from "react";
import { Check } from "lucide-react";

import { unlockedByPassword$ } from "@/accounts/unlock-request";
import { localAccountFor } from "@/accounts/login";
import { updateMetadata } from "@/accounts/metadata";
import { isPasskeyCancelled, passkeyMethod, PasskeyPrfUnsupportedError } from "@/accounts/passkey";
import { addPasskey, canOfferPasskey } from "@/accounts/passkey-flow";
import type { LocalAccount } from "@/accounts/local-account";
import { PasskeyIcon } from "@/components/PasskeyIcon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { tone } from "@/lib/tones";

export function PasskeyOffer() {
  const [account, setAccount] = useState<LocalAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const method = passkeyMethod();

  useEffect(() => {
    const subscription = unlockedByPassword$.subscribe((pubkey) => {
      const unlocked = localAccountFor(pubkey);
      void canOfferPasskey(unlocked).then((offer) => {
        if (offer && unlocked) {
          setError(null);
          setAccount(unlocked);
        }
      });
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!account) return null;

  const decline = () => {
    if (busy) return;
    updateMetadata(account, { passkeyOfferDeclined: true });
    setAccount(null);
  };

  const turnOn = async () => {
    setBusy(true);
    setError(null);
    try {
      const added = await addPasskey(account);
      setAccount(null);
      toast({
        title: `${method.label} is on`,
        description: added.synced
          ? `Unlock with ${method.withPhrase} here and on your other devices.`
          : `Unlock with ${method.withPhrase} on this device.`,
      });
    } catch (err) {
      if (isPasskeyCancelled(err)) return;
      setError(
        err instanceof PasskeyPrfUnsupportedError
          ? "Your password manager made a passkey but can't lock your key with it. Nothing changed — you can delete the new brainstorm passkey from it."
          : "Couldn't turn it on. Your recovery password still works.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && decline()}>
      <DialogContent className="sm:max-w-[420px]" data-testid="modal-passkey-offer">
        <DialogHeader>
          <span
            className={`mb-1 flex h-12 w-12 items-center justify-center rounded-xl ${tone("violet").bg} ${tone("violet").icon}`}
          >
            <PasskeyIcon className="h-6 w-6" />
          </span>
          <DialogTitle>Skip the password next time?</DialogTitle>
          <DialogDescription>
            Turn on {method.withPhrase} and Brainstorm unlocks in one tap, here and on any device where your passkeys
            sync.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 text-[13px] leading-snug text-foreground/80">
          <li className="flex gap-2">
            <Check className={`mt-0.5 h-4 w-4 shrink-0 ${tone("success").icon}`} />
            Your recovery password and backup file keep working.
          </li>
          <li className="flex gap-2">
            <Check className={`mt-0.5 h-4 w-4 shrink-0 ${tone("success").icon}`} />
            We keep a locked copy of your key that only your passkey can open. We can't read it.
          </li>
        </ul>

        {error && (
          <p className={`text-sm ${tone("danger").text}`} data-testid="text-passkey-offer-error">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2 pt-1">
          <Button
            type="button"
            variant="neutral"
            size="lg"
            onClick={turnOn}
            disabled={busy}
            data-testid="button-passkey-offer-accept"
          >
            {busy
              ? `Waiting for ${method.label}…`
              : `Turn on ${method.label === "Passkey" ? "a passkey" : method.label}`}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={decline}
            disabled={busy}
            data-testid="button-passkey-offer-decline"
          >
            Not now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
