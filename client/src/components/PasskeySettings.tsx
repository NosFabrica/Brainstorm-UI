/**
 * Settings › Account › Passkeys: the passkeys that unlock this Account — the
 * ones this device keeps a seal for and the ones the server holds a copy for,
 * made on other devices — with adding and removing.
 *
 * Only for an Account whose key this app holds; an extension or a bunker has its
 * own way of being unlocked, and nothing here would mean anything to it.
 */
import { useEffect, useState } from "react";
import { useActiveAccount } from "applesauce-react/hooks";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { LocalAccount } from "@/accounts/local-account";
import { getMetadata, type BrainstormAccount } from "@/accounts/metadata";
import { isPasskeyCancelled, PasskeyPrfUnsupportedError, type PasskeySupport } from "@/accounts/passkey";
import {
  addPasskey,
  listPasskeys,
  removePasskey,
  syncPendingPasskeys,
  type PasskeyListing,
} from "@/accounts/passkey-flow";
import { passkeyVaultApi } from "@/services/api/passkeyVault";
import { PasskeyIcon } from "@/components/PasskeyIcon";
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
import { Chip } from "@/components/ui/chip";
import { useToast } from "@/hooks/use-toast";
import { usePasskeySupport } from "@/hooks/usePasskeySupport";
import { tone } from "@/lib/tones";

const DAY_MS = 86_400_000;

function addedLine(listing: PasskeyListing): string {
  const date = listing.addedAt
    ? new Date(listing.addedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;
  const used = listing.lastUsedAt
    ? (() => {
        const days = Math.floor((Date.now() - listing.lastUsedAt) / DAY_MS);
        return days < 1 ? "Used today" : days === 1 ? "Used yesterday" : `Used ${days} days ago`;
      })()
    : null;
  return [`Added on ${listing.device}`, date, used].filter(Boolean).join(" · ");
}

function unsupportedCopy(support: PasskeySupport): string {
  if (support.supported) return "";
  if (support.reason === "no-prf") {
    return "This browser can't unlock a key with a passkey yet. Open Brainstorm in Chrome or Safari to add one — your recovery password works here as usual.";
  }
  return "Passkeys aren't available in this browser. Your recovery password works here as usual.";
}

export function PasskeySettings() {
  const account = useActiveAccount() as BrainstormAccount | undefined;
  if (!(account instanceof LocalAccount)) return null;
  return <PasskeySettingsFor account={account} />;
}

function PasskeySettingsFor({ account }: { account: LocalAccount }) {
  const { support, method } = usePasskeySupport();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<PasskeyListing | null>(null);
  // Bumped whenever this device's seals change, so the merged list recomputes.
  const [version, setVersion] = useState(0);
  const [listings, setListings] = useState<PasskeyListing[]>([]);

  const server = useQuery({
    queryKey: ["passkeyVaults", account.pubkey],
    queryFn: () => passkeyVaultApi.listPasskeyVaults(),
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    void syncPendingPasskeys(account).then(() => setVersion((v) => v + 1));
  }, [account]);

  useEffect(() => {
    let live = true;
    void listPasskeys(account, server.data ?? null).then((rows) => {
      if (live) setListings(rows);
    });
    return () => {
      live = false;
    };
  }, [account, server.data, version]);

  const refresh = () => {
    setVersion((v) => v + 1);
    void queryClient.invalidateQueries({ queryKey: ["passkeyVaults", account.pubkey] });
  };

  const add = async () => {
    setBusy(true);
    try {
      const added = await addPasskey(account);
      toast({
        title: "Passkey added",
        description: added.synced
          ? `Unlock with ${method.withPhrase} here and on your other devices.`
          : `Unlock with ${method.withPhrase} on this device. It will be ready on others once it reaches Brainstorm.`,
      });
    } catch (err) {
      if (!isPasskeyCancelled(err)) {
        toast({
          variant: "destructive",
          title: "Couldn't add a passkey",
          description:
            err instanceof PasskeyPrfUnsupportedError
              ? "Your password manager made a passkey but can't lock a key with it. Nothing changed — you can delete the new brainstorm passkey from it, and try iCloud Keychain or Google Password Manager."
              : err instanceof Error
                ? err.message
                : undefined,
        });
      }
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const confirmRemove = async () => {
    const listing = removing;
    setRemoving(null);
    if (!listing) return;
    try {
      await removePasskey(account, listing);
      toast({ title: "Passkey removed" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't remove the passkey",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      refresh();
    }
  };

  const local = listings.filter((listing) => listing.local);
  const removingLast = !!removing?.local && local.length === 1;
  const noBackup = !getMetadata(account).backedUp;
  // Without a password or an Unlock cache, this device's last seal is the only
  // thing that opens the key here. Removing it would leave nothing.
  const lastWayIn = removingLast && !account.signer.data.ncryptsec && !account.signer.data.envelope;

  return (
    <div className="border-t border-slate-100 pt-4 dark:border-slate-800/60" data-testid="row-account-passkeys">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Passkeys
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Unlock with Face ID, Touch ID or Windows Hello instead of your password.
          </p>
        </div>
        {support?.supported && (
          <button
            type="button"
            onClick={add}
            disabled={busy}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            data-testid="button-add-passkey"
          >
            <Plus className="h-3.5 w-3.5" /> {busy ? `Waiting for ${method.label}…` : "Add a passkey"}
          </button>
        )}
      </div>

      {support && !support.supported && (
        <div
          className="mb-3 rounded-xl border border-dashed border-slate-300 p-3 text-xs leading-relaxed text-slate-600 dark:border-slate-700 dark:text-slate-300"
          data-testid="text-passkeys-unsupported"
        >
          <span className="mb-0.5 block text-sm font-semibold text-slate-900 dark:text-slate-100">
            Not available in this browser
          </span>
          {unsupportedCopy(support)}
        </div>
      )}

      {listings.length > 0 && (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {listings.map((listing) => (
            <li
              key={listing.credentialIdHash}
              className="flex items-center gap-3 px-3.5 py-3"
              data-testid={`row-passkey-${listing.credentialIdHash.slice(0, 12)}`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone("violet").bg} ${tone("violet").icon}`}
              >
                <PasskeyIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{listing.provider}</span>
                  {listing.local && (
                    <Chip tone="slate" size="sm">
                      This device
                    </Chip>
                  )}
                  {listing.local && !listing.onServer && !listing.local.synced && (
                    <Chip tone="warning" size="sm">
                      This device only
                    </Chip>
                  )}
                </div>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{addedLine(listing)}</p>
              </div>
              <button
                type="button"
                onClick={() => setRemoving(listing)}
                className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                data-testid={`button-remove-passkey-${listing.credentialIdHash.slice(0, 12)}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {listings.length > 0 && (
        <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          Each passkey opens a locked copy of your key that Brainstorm keeps so you can sign in on a new device. We
          can't open it. Removing a passkey deletes its copy.
        </p>
      )}

      <AlertDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent data-testid="modal-remove-passkey">
          <AlertDialogHeader>
            <AlertDialogTitle>{removingLast ? "Remove your only passkey?" : "Remove this passkey?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {lastWayIn
                ? "It's the only way this device can unlock your key. Set a recovery password in Back up first, then remove it."
                : removingLast
                  ? "This device will ask for your recovery password instead. A new device will need your key or backup file."
                  : "It won't unlock this account anymore. The passkey stays in your password manager until you delete it there."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removingLast && noBackup && !lastWayIn && (
            <div
              className={`rounded-lg border p-3 text-xs leading-relaxed ${tone("warning").bg} ${tone("warning").border} ${tone("warning").text}`}
            >
              You haven't saved a backup yet. Download it first, or you could lose this account.
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-remove-passkey-cancel">Cancel</AlertDialogCancel>
            {(lastWayIn || (removingLast && noBackup)) && (
              <AlertDialogAction
                className="border border-border bg-card text-foreground hover:bg-muted"
                onClick={() =>
                  document.getElementById("account-backup-section")?.scrollIntoView({ behavior: "smooth" })
                }
                data-testid="button-remove-passkey-backup-first"
              >
                Back up first
              </AlertDialogAction>
            )}
            {!lastWayIn && (
              <AlertDialogAction
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={confirmRemove}
                data-testid="button-remove-passkey-confirm"
              >
                Remove
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
